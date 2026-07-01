import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import type { PlanType } from '@/types/auth';

export const dynamic = 'force-dynamic';

// Changes plan_type in DB for non-active (trialing/expired/cancelled) users.
// Active paid subscribers must go through /api/stripe/upgrade for proration.
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

    const updated = await withAdminDb(async (req) => {
      // Only allowed when not an active paid subscriber — active subs must go through Stripe
      const check = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT subscription_status FROM Tenants WHERE tenant_id = @tenantId`);

      const row = check.recordset[0];
      if (!row) return false;
      if (row.subscription_status === 'active') return false;

      await req
        .input('plan',      mssql.NVarChar(20),    plan)
        .input('tenantId2', mssql.UniqueIdentifier, tenantId)
        .query(`UPDATE Tenants SET plan_type = @plan WHERE tenant_id = @tenantId2`);

      return true;
    });

    if (!updated) {
      return NextResponse.json({ error: 'Cannot change plan — use the upgrade route for active subscriptions' }, { status: 400 });
    }

    return NextResponse.json({ success: true, plan: plan as PlanType });
  } catch (error) {
    console.error('[user/plan] Error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}
