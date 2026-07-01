import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import type { PlanType } from '@/types/auth';

export const dynamic = 'force-dynamic';

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
        .query(`SELECT stripe_customer_id, subscription_status FROM Tenants WHERE tenant_id = @tenantId`);
      return result.recordset[0] ?? null;
    });

    // Trialing users (with or without stripe_customer_id) just get their plan_type updated —
    // no payment needed until trial ends and they subscribe
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
      // No Stripe customer yet — update plan_type in DB and send to checkout to subscribe
      await withAdminDb(async (req) => {
        await req
          .input('plan',     mssql.NVarChar(20),    plan)
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`UPDATE Tenants SET plan_type = @plan WHERE tenant_id = @tenantId`);
      });
      return NextResponse.json({ redirect: 'checkout' }, { status: 200 });
    }

    if (tenantRow.subscription_status !== 'active') {
      // Cancelled or past-due — use checkout to resubscribe
      return NextResponse.json({ redirect: 'checkout' }, { status: 200 });
    }

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

    // Update the subscription to the new price (pro-rated).
    // automatic_tax inherits the customer's stored billing address from checkout,
    // so no address re-collection is needed here.
    await stripe.subscriptions.update(subscription.id, {
      proration_behavior: 'create_prorations',
      automatic_tax:      { enabled: true },
      items: [{ id: currentItemId, price: priceIdForPlan(plan as PlanType) }],
      metadata: { tenantId, plan },
    });

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error('[stripe/upgrade] Error:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}
