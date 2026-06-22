// =============================================================================
// AdLeak Shield — Admin Auth Helper
// src/lib/adminAuth.ts
// =============================================================================

import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { AccessibleDomain } from '@/types/auth';

export const IMP_COOKIE       = 'als_imp';
export const IMP_LABEL_COOKIE = 'als_imp_label';

// ---------------------------------------------------------------------------
// requireOwner — call at the top of every /api/admin/* route.
// ---------------------------------------------------------------------------
export async function requireOwner() {
  const session = await auth();
  if (!session?.user?.isOwner) return null;
  return session;
}

// ---------------------------------------------------------------------------
// ownerNotFound — return a plain 404 to hide route existence from non-owners.
// ---------------------------------------------------------------------------
export function ownerNotFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ---------------------------------------------------------------------------
// getEffectiveTenantId
//
// Priority order:
//   1. Admin impersonation cookie (owner only)
//   2. activeTenantId from JWT (domain switching for multi-tenant access)
//   3. Own tenantId (default)
//
// If opts is not provided the function reads activeTenantId + allAccessibleDomains
// from the current session automatically — this means ALL existing callers that
// pass only (ownTenantId, isOwner) gain multi-tenant switching for free without
// any call-site changes.
// ---------------------------------------------------------------------------
export async function getEffectiveTenantId(
  ownTenantId: string,
  isOwner: boolean,
  opts?: {
    activeTenantId?: string;
    allAccessibleDomains?: AccessibleDomain[];
  }
): Promise<{
  tenantId: string;
  isImpersonating: boolean;
  impersonatedEmail: string | null;
  role: 'owner' | 'editor' | 'visitor';
}> {
  // ── Priority 1: Admin impersonation ──────────────────────────────────────
  if (isOwner) {
    const cookieStore = await cookies();
    const impCookie   = cookieStore.get(IMP_COOKIE);
    if (impCookie?.value) {
      const labelCookie = cookieStore.get(IMP_LABEL_COOKIE);
      return {
        tenantId:         impCookie.value,
        isImpersonating:  true,
        impersonatedEmail: labelCookie?.value ?? null,
        role:             'owner',
      };
    }
  }

  // ── Resolve activeTenantId and accessible domains ─────────────────────────
  let activeTenantId: string | undefined    = opts?.activeTenantId;
  let accessibleDomains: AccessibleDomain[] = opts?.allAccessibleDomains ?? [];

  if (!opts) {
    // Auto-read from the current session so callers don't need to pass opts
    try {
      const session     = await auth();
      activeTenantId    = session?.user?.activeTenantId;
      accessibleDomains = session?.user?.allAccessibleDomains ?? [];
    } catch {
      // Non-fatal — falls through to own tenant
    }
  }

  // ── Priority 2: Active tenant switching ──────────────────────────────────
  const effectiveId = activeTenantId ?? ownTenantId;
  if (effectiveId && effectiveId !== ownTenantId) {
    const entry = accessibleDomains.find(d => d.tenantId === effectiveId);
    if (entry) {
      return {
        tenantId:         effectiveId,
        isImpersonating:  false,
        impersonatedEmail: null,
        role:             entry.role,
      };
    }
    // activeTenantId is not in the accessible list — security: fall back to own
    console.warn(`[Auth] activeTenantId ${effectiveId} not in allAccessibleDomains for ${ownTenantId}`);
  }

  // ── Default: own tenant ───────────────────────────────────────────────────
  return {
    tenantId:         ownTenantId,
    isImpersonating:  false,
    impersonatedEmail: null,
    role:             'owner',
  };
}

// ---------------------------------------------------------------------------
// blockedInImpersonation — use in write routes when isImpersonating = true.
// ---------------------------------------------------------------------------
export function blockedInImpersonation() {
  return NextResponse.json(
    { error: 'Write operations are disabled in view-as mode' },
    { status: 403 }
  );
}

// ---------------------------------------------------------------------------
// forbidden — 403 for role-based access denials (visitor can't write, etc.)
// ---------------------------------------------------------------------------
export function forbidden(message = 'Insufficient permissions') {
  return NextResponse.json({ error: message }, { status: 403 });
}
