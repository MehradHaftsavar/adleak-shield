import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import { checkUsageAgainstPlan } from '@/lib/checkPlanUsage';
import * as mssql from 'mssql';
import type { PlanType } from '@/types/auth';

export const dynamic = 'force-dynamic';

// Changes plan_type in DB for genuine trialing users (no prior subscription).
// Returning subscribers (stripe_customer_id exists) are redirected to checkout.
// Active paid subscribers must go through /api/stripe/upgrade.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const plan: string = body?.plan;
    if (!plan || !['starter', 'freelancer', 'agency'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const tenantId = session.user.tenantId as string;

    const tenantRow = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT subscription_status, stripe_customer_id, trial_ends_at FROM Tenants WHERE tenant_id = @tenantId`);
      return r.recordset[0] ?? null;
    });

    if (!tenantRow) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (tenantRow.subscription_status === 'active') {
      return NextResponse.json(
        { error: 'Cannot change plan — use the upgrade route for active subscriptions' },
        { status: 400 },
      );
    }

    // Limit check: ensure current usage fits within the target plan
    const limitCheck = await checkUsageAgainstPlan(tenantId, plan as PlanType);
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.error }, { status: 400 });
    }

    // Returning subscriber (has had a paid sub before) — must create a new subscription
    // through Stripe Checkout rather than just updating the DB preference.
    // Also redirect expired-trial users: their trial has ended so they need to pay now.
    const trialExpired =
      tenantRow.trial_ends_at != null &&
      new Date(tenantRow.trial_ends_at) < new Date();

    if (tenantRow.stripe_customer_id || trialExpired) {
      return NextResponse.json({ redirect: 'checkout' });
    }

    // Genuine active trial user (never subscribed, trial still running) —
    // update plan preference in DB. Payment starts at trial end via Stripe.
    await withAdminDb(async (req) => {
      await req
        .input('plan',     mssql.NVarChar(20),    plan)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`UPDATE Tenants SET plan_type = @plan WHERE tenant_id = @tenantId`);
    });

    return NextResponse.json({ success: true, plan: plan as PlanType });
  } catch (error) {
    console.error('[user/plan] Error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}
