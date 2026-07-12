import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import { getPlanFromPriceId } from '@/lib/planLimits';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;

    const tenantRow = await withAdminDb(async (req) => {
      const result = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT stripe_customer_id FROM Tenants WHERE tenant_id = @tenantId`);
      return result.recordset[0] ?? null;
    });

    if (!tenantRow?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer found' }, { status: 400 });
    }

    // Fetch the live subscription directly from Stripe — source of truth
    const subscriptions = await stripe.subscriptions.list({
      customer: tenantRow.stripe_customer_id as string,
      status: 'active',
      limit: 1,
    });

    // Exclude cancel_at_period_end subs — treated as canceled same as webhook logic
    const sub = subscriptions.data.find(s => !s.cancel_at_period_end) ?? null;
    if (!sub) {
      // No truly active Stripe subscription — check current DB status before writing anything.
      // Only correct to 'canceled' if DB currently says 'active' (stale state).
      // Never touch trialing users — they have no Stripe sub by design.
      const currentRow = await withAdminDb(async (req) => {
        const r = await req
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`SELECT subscription_status FROM Tenants WHERE tenant_id = @tenantId`);
        return r.recordset[0] ?? null;
      });
      const currentStatus = currentRow?.subscription_status ?? null;

      if (currentStatus === 'active') {
        await withAdminDb(async (req) => {
          await req
            .input('tenantId', mssql.UniqueIdentifier, tenantId)
            .query(`
              UPDATE Tenants
              SET subscription_status       = 'canceled',
                  subscription_cancelled_at = ISNULL(subscription_cancelled_at, GETUTCDATE())
              WHERE tenant_id = @tenantId
            `);
        });
      }

      return NextResponse.json({ subscriptionStatus: currentStatus === 'active' ? 'canceled' : currentStatus, plan: null });
    }

    const priceId = sub.items.data[0]?.price?.id;
    const plan = priceId ? getPlanFromPriceId(priceId) : null;

    if (!plan) {
      return NextResponse.json({ error: 'Unrecognised price' }, { status: 400 });
    }

    // Write to DB immediately — don't wait for the webhook
    await withAdminDb(async (req) => {
      await req
        .input('plan',     mssql.NVarChar(20),    plan)
        .input('status',   mssql.NVarChar(20),    sub.status)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          UPDATE Tenants
          SET plan_type           = @plan,
              subscription_status = @status
          WHERE tenant_id = @tenantId
        `);
    });

    return NextResponse.json({ plan, subscriptionStatus: sub.status });
  } catch (error) {
    console.error('[stripe/sync-plan] Error:', error);
    return NextResponse.json({ error: 'Failed to sync plan' }, { status: 500 });
  }
}
