// =============================================================================
// AdLeak Shield — Admin: Start Impersonation
// src/app/api/admin/tenants/[tenantId]/impersonate/route.ts
//
// POST — sets httpOnly cookies that make tenant-facing API routes query
//         the target tenant's data instead of the owner's own data.
//
// SECURITY:
//   - Owner session required (JWT isOwner = true checked here)
//   - tenantId verified to exist in DB before setting cookie
//   - als_imp cookie is httpOnly (JS cannot read/steal it)
//   - als_imp_label (email) is NOT httpOnly so the client banner can read it
//   - ALL writes in tenant-facing routes are blocked during impersonation
//   - Cookie expires in 2 hours (auto-ends impersonation)
//
// Owner-only. Returns 404 for non-owners.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, ownerNotFound, IMP_COOKIE, IMP_LABEL_COOKIE } from '@/lib/adminAuth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

const COOKIE_MAX_AGE = 2 * 60 * 60; // 2 hours in seconds

export async function POST(
  _request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  const { tenantId } = params;

  // Double-check: prevent owner from impersonating themselves
  if (tenantId === session.user.tenantId) {
    return NextResponse.json(
      { error: 'Cannot impersonate your own account' },
      { status: 400 }
    );
  }

  // Verify the tenant exists in DB before setting cookie
  const tenant = await withAdminDb(async (req) => {
    const r = await req
      .input('tenantId', mssql.UniqueIdentifier, tenantId)
      .query(`SELECT tenant_id, email FROM Tenants WHERE tenant_id = @tenantId`);
    return r.recordset[0] ?? null;
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const response = NextResponse.json({
    success: true,
    impersonating: { tenantId, email: tenant.email },
  });

  // als_imp — httpOnly: the actual tenantId, only readable by server
  response.cookies.set(IMP_COOKIE, tenantId, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   COOKIE_MAX_AGE,
  });

  // als_imp_label — NOT httpOnly: email string for the client-side banner
  response.cookies.set(IMP_LABEL_COOKIE, tenant.email, {
    httpOnly: false,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   COOKIE_MAX_AGE,
  });

  return response;
}
