// =============================================================================
// AdLeak Shield — Admin: Extend Trial
// src/app/api/admin/tenants/[tenantId]/extend-trial/route.ts
//
// POST { days: number } — extends trial_ends_at by N days (default 7).
//   If the tenant has no trial end date, sets it to N days from now.
//   Also resets subscription_status = 'trialing' if currently inactive.
//
// Owner-only. Returns 404 for non-owners.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, ownerNotFound } from '@/lib/adminAuth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export async function POST(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  const { tenantId } = params;

  let days = 7;
  try {
    const body = await request.json();
    if (body?.days && Number.isInteger(body.days) && body.days > 0 && body.days <= 365) {
      days = body.days;
    }
  } catch {
    // Body parsing failed — use default 7 days
  }

  try {
    // Step 1: Read current trial end date
    const tenant = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          SELECT tenant_id, email, subscription_status, trial_ends_at
          FROM Tenants
          WHERE tenant_id = @tenantId
        `);
      return r.recordset[0] ?? null;
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Step 2: Calculate new end date
    const now        = new Date();
    const currentEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
    const base       = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd     = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    // Step 3: Apply update
    await withAdminDb(async (req) => {
      await req
        .input('newEnd',    mssql.DateTime,        newEnd)
        .input('tenantId',  mssql.UniqueIdentifier, tenantId)
        .query(`
          UPDATE Tenants
          SET trial_ends_at       = @newEnd,
              subscription_status = CASE
                WHEN subscription_status = 'active' THEN 'active'
                ELSE 'trialing'
              END
          WHERE tenant_id = @tenantId
        `);
    });

    return NextResponse.json({
      success:        true,
      tenantId,
      email:          tenant.email,
      newTrialEndsAt: newEnd.toISOString(),
      daysAdded:      days,
    });
  } catch (err) {
    console.error('[Admin] Extend trial error:', err);
    return NextResponse.json({ error: 'Failed to extend trial' }, { status: 500 });
  }
}
