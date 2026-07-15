import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

// Lightweight read of the OWN tenant's live subscription status/plan straight from
// the DB. Used by the subscription page so its banner and plan cards reflect the
// true state on load without depending on a possibly-stale JWT. Deliberately reads
// session.user.tenantId (the own account that Stripe bills), not the switched tenant.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;

    const row = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          SELECT subscription_status, trial_ends_at,
                 ISNULL(plan_type, 'starter') AS plan_type
          FROM   Tenants
          WHERE  tenant_id = @tenantId
        `);
      return r.recordset[0] ?? null;
    });

    if (!row) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({
      subscriptionStatus: row.subscription_status ?? null,
      planType:           row.plan_type ?? 'starter',
      trialEndsAt:        row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
    });
  } catch (error) {
    console.error('[user/subscription-status] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch subscription status' }, { status: 500 });
  }
}
