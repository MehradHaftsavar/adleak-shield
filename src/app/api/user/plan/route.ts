import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import { checkUsageAgainstPlan } from '@/lib/checkPlanUsage';
import * as mssql from 'mssql';
import type { PlanType } from '@/types/auth';

export const dynamic = 'force-dynamic';

// Any non-active tenant (trialing, expired trial, canceled, or returning
// subscriber) is redirected to Stripe Checkout — plan changes always start
// billing immediately rather than waiting for a trial to end.
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
        .query(`SELECT subscription_status FROM Tenants WHERE tenant_id = @tenantId`);
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

    // Not an active paid subscriber (trialing — expired or still running,
    // canceled, or a returning subscriber) — always send to Stripe Checkout
    // so payment starts now instead of waiting for a trial to end.
    return NextResponse.json({ redirect: 'checkout' });
  } catch (error) {
    console.error('[user/plan] Error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}
