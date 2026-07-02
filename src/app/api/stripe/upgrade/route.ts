import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { withAdminDb, withTenantDb } from '@/lib/db/client';
import { PLAN_LIMITS } from '@/lib/planLimits';
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

    // If the subscription already has a schedule attached we must handle it first.
    const existingScheduleId = subscription.schedule as string | null | undefined;

    if (isUpgrade) {
      // If there's a pending downgrade schedule, release it before upgrading.
      if (existingScheduleId) {
        await stripe.subscriptionSchedules.release(existingScheduleId);
      }
      // Upgrade: send user to Stripe's hosted confirmation page so they see
      // the prorated charge and explicitly confirm before anything is billed.
      // The subscription_update_confirm flow pre-computes the proration and
      // shows it to the user. On confirm, Stripe fires customer.subscription.updated
      // and the webhook updates plan_type in the DB.
      const portalSession = await stripe.billingPortal.sessions.create({
        customer:   tenantRow.stripe_customer_id as string,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription?upgrade=success`,
        flow_data:  {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: subscription.id,
            items: [{ id: currentItemId, price: priceIdForPlan(plan as PlanType), quantity: 1 }],
          },
        },
      });
      return NextResponse.json({ url: portalSession.url });
    } else {
      // Downgrade: check the user isn't over the target plan's limits before scheduling.
      const limits = PLAN_LIMITS[plan as PlanType];
      // Domains + Campaigns have RLS — must use withTenantDb.
      // TeamMembers has no RLS predicate — use withAdminDb with explicit tenant filter.
      const [rlsUsage, memberCount] = await Promise.all([
        withTenantDb(tenantId, async (req) => {
          const r = await req.query(`
            SELECT
              (SELECT COUNT(*) FROM Domains) AS domainCount,
              (SELECT ISNULL(MAX(cnt), 0) FROM (
                SELECT COUNT(*) AS cnt FROM Campaigns GROUP BY domain_id
              ) AS perDomain) AS maxCampaignsOnOneDomain
          `);
          return r.recordset[0] ?? { domainCount: 0, maxCampaignsOnOneDomain: 0 };
        }),
        withAdminDb(async (req) => {
          const r = await req
            .input('tenantId', mssql.UniqueIdentifier, tenantId)
            .query(`SELECT COUNT(*) AS cnt FROM TeamMembers WHERE tenant_id = @tenantId AND accepted_at IS NOT NULL`);
          return (r.recordset[0]?.cnt ?? 0) as number;
        }),
      ]);

      const usage = { ...rlsUsage, memberCount };

      const totalSeats = (usage.memberCount ?? 0) + 1; // +1 for owner
      const violations: string[] = [];

      if ((usage.domainCount ?? 0) > limits.domains)
        violations.push('domains');
      if ((usage.maxCampaignsOnOneDomain ?? 0) > limits.campaignsPerDomain)
        violations.push('campaigns');
      if (totalSeats > limits.seats)
        violations.push('team members');

      if (violations.length > 0) {
        const list = violations.length === 1
          ? violations[0]
          : violations.slice(0, -1).join(', ') + ' and ' + violations[violations.length - 1];
        return NextResponse.json({
          error: `You have too many ${list} for the ${limits.label} plan. Please reduce them before downgrading.`,
        }, { status: 400 });
      }

      // Schedule the plan change for end of current billing period.
      // If the subscription already has a schedule (e.g. user clicked twice), update
      // it in place rather than trying to create another one.
      const scheduleId = existingScheduleId
        ? existingScheduleId
        : (await stripe.subscriptionSchedules.create({ from_subscription: subscription.id })).id;

      await stripe.subscriptionSchedules.update(scheduleId, {
        end_behavior: 'release',
        phases: [
          {
            start_date: 'now',
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
