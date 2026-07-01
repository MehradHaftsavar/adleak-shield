import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import type { PlanType } from '@/types/auth';

export const dynamic = 'force-dynamic';

const PLAN_ORDER: Record<string, number> = { starter: 0, freelancer: 1, agency: 2 };

function priceIdForPlan(plan: PlanType): string {
  if (plan === 'freelancer') return process.env.STRIPE_PRICE_FREELANCER!;
  if (plan === 'agency')     return process.env.STRIPE_PRICE_AGENCY!;
  return process.env.STRIPE_PRICE_ID!;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;

    const body = await request.json();
    const { plan } = body;
    if (!plan || !['starter', 'freelancer', 'agency'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const tenantRow = await withAdminDb(async (req) => {
      const result = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT stripe_customer_id, subscription_status, plan_type FROM Tenants WHERE tenant_id = @tenantId`);
      return result.recordset[0] ?? null;
    });

    // Trialing users just get plan_type updated — no payment until trial ends
    if (tenantRow?.subscription_status === 'trialing') {
      await withAdminDb(async (req) => {
        await req
          .input('plan',     mssql.NVarChar(20),    plan)
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`UPDATE Tenants SET plan_type = @plan WHERE tenant_id = @tenantId`);
      });
      return NextResponse.json({ success: true, plan });
    }

    if (!tenantRow?.stripe_customer_id) {
      return NextResponse.json({ redirect: 'checkout' }, { status: 200 });
    }

    if (tenantRow.subscription_status !== 'active') {
      return NextResponse.json({ redirect: 'checkout' }, { status: 200 });
    }

    const currentPlan = (tenantRow.plan_type ?? 'starter') as string;
    const isUpgrade = (PLAN_ORDER[plan] ?? 0) > (PLAN_ORDER[currentPlan] ?? 0);

    // Find the active subscription for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: tenantRow.stripe_customer_id as string,
      status:   'active',
      limit:    1,
    });

    const subscription = subscriptions.data[0];
    if (!subscription) {
      // DB says active but no live Stripe subscription — update plan_type only
      await withAdminDb(async (req) => {
        await req
          .input('plan',     mssql.NVarChar(20),    plan)
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`UPDATE Tenants SET plan_type = @plan WHERE tenant_id = @tenantId`);
      });
      return NextResponse.json({ success: true, plan });
    }

    const currentItemId = subscription.items.data[0]?.id;
    if (!currentItemId) {
      return NextResponse.json({ error: 'No subscription item found' }, { status: 400 });
    }

    if (isUpgrade) {
      // Upgrade: charge prorated difference immediately, update DB now
      await stripe.subscriptions.update(subscription.id, {
        proration_behavior: 'create_prorations',
        automatic_tax:      { enabled: true },
        items: [{ id: currentItemId, price: priceIdForPlan(plan as PlanType) }],
        metadata: { tenantId, plan },
      });
      await withAdminDb(async (req) => {
        await req
          .input('plan',     mssql.NVarChar(20),    plan)
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`UPDATE Tenants SET plan_type = @plan WHERE tenant_id = @tenantId`);
      });
      return NextResponse.json({ success: true, plan });
    } else {
      // Downgrade: schedule the plan change for end of current billing period.
      // Using a subscription schedule so Stripe only fires subscription.updated
      // when the new phase actually executes at renewal — DB stays on old plan until then.
      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: subscription.id,
      });
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
          {
            items: [{ price: subscription.items.data[0].price.id as string, quantity: 1 }],
            end_date: subscription.current_period_end,
          },
          {
            items: [{ price: priceIdForPlan(plan as PlanType), quantity: 1 }],
          },
        ],
        metadata: { tenantId, plan },
      });
      return NextResponse.json({ success: true, plan, scheduledDowngrade: true });
    }
  } catch (error) {
    console.error('[stripe/upgrade] Error:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}
