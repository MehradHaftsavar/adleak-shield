// =============================================================================
// AdLeak Shield — Admin Auth Helper
// src/lib/adminAuth.ts
//
// Shared utilities for:
//   1. Verifying a caller is the owner (returns null → caller returns 404)
//   2. Resolving the "effective" tenant ID for impersonation
//
// IMPERSONATION:
//   When the owner sets als_imp cookie via /api/admin/tenants/[id]/impersonate,
//   all tenant-facing API routes (sessions, leaks, etc.) query THAT tenant's
//   data instead of the owner's own data. All writes are blocked.
//
// COOKIE DESIGN:
//   als_imp       — httpOnly, Secure — contains the impersonated tenantId
//   als_imp_label — NOT httpOnly    — contains the tenant email (for UI banner)
// =============================================================================

import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Name constants — avoids typos across files
export const IMP_COOKIE     = 'als_imp';
export const IMP_LABEL_COOKIE = 'als_imp_label';

// ---------------------------------------------------------------------------
// requireOwner
// Call at the top of every /api/admin/* route.
// Returns the session if the caller is an authenticated owner.
// Returns null if not — the caller MUST return ownerNotFound() to get a 404.
//
// WHY 404 NOT 401?
// Returning 401/403 tells pentesters the route EXISTS. 404 hides it entirely.
// ---------------------------------------------------------------------------
export async function requireOwner() {
  const session = await auth();
  if (!session?.user?.isOwner) return null;
  return session;
}

// ---------------------------------------------------------------------------
// ownerNotFound
// Returns a plain 404 — use this whenever requireOwner() returns null.
// ---------------------------------------------------------------------------
export function ownerNotFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ---------------------------------------------------------------------------
// getEffectiveTenantId
// Call in any tenant-facing API route to support admin impersonation.
//
// If the caller is an owner AND has the als_imp cookie set, returns the
// impersonated tenant's ID. Otherwise returns the caller's own tenantId.
//
// The isImpersonating flag lets callers block writes during impersonation.
// ---------------------------------------------------------------------------
export async function getEffectiveTenantId(
  ownTenantId: string,
  isOwner: boolean
): Promise<{
  tenantId: string;
  isImpersonating: boolean;
  impersonatedEmail: string | null;
}> {
  if (!isOwner) {
    return { tenantId: ownTenantId, isImpersonating: false, impersonatedEmail: null };
  }

  const cookieStore = await cookies();
  const impCookie   = cookieStore.get(IMP_COOKIE);

  if (impCookie?.value) {
    const labelCookie = cookieStore.get(IMP_LABEL_COOKIE);
    return {
      tenantId:         impCookie.value,
      isImpersonating:  true,
      impersonatedEmail: labelCookie?.value ?? null,
    };
  }

  return { tenantId: ownTenantId, isImpersonating: false, impersonatedEmail: null };
}

// ---------------------------------------------------------------------------
// blockedInImpersonation
// Call this in write routes (POST/PATCH/DELETE) when isImpersonating = true.
// ---------------------------------------------------------------------------
export function blockedInImpersonation() {
  return NextResponse.json(
    { error: 'Write operations are disabled in view-as mode' },
    { status: 403 }
  );
}
