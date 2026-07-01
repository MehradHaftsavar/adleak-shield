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
  activeDomainId: string | null;
  // null  = own tenant or impersonation — no domain restriction
  // []    = member with no accessible domains
  // [...] = member restricted to these domain IDs
  memberDomainIds: string[] | null;
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
        tenantId:          impCookie.value,
        activeDomainId:    null,
        memberDomainIds:   null, // impersonation sees all domains
        isImpersonating:   true,
        impersonatedEmail: labelCookie?.value ?? null,
        role:              'owner',
      };
    }
  }

  // ── Resolve activeTenantId, activeDomainId, and accessible domains ────────
  let activeTenantId: string | undefined    = opts?.activeTenantId;
  let activeDomainId: string | null         = null;
  let accessibleDomains: AccessibleDomain[] = opts?.allAccessibleDomains ?? [];

  if (!opts) {
    try {
      const session     = await auth();
      activeTenantId    = session?.user?.activeTenantId;
      activeDomainId    = session?.user?.activeDomainId ?? null;
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
      // Member viewing another workspace — collect their MDA-granted domain IDs
      const memberDomainIds = accessibleDomains
        .filter(d => d.tenantId === effectiveId)
        .map(d => d.domainId);
      return {
        tenantId:          effectiveId,
        activeDomainId:    activeDomainId,
        memberDomainIds,
        isImpersonating:   false,
        impersonatedEmail: null,
        role:              entry.role,
      };
    }
    console.warn(`[Auth] activeTenantId ${effectiveId} not in allAccessibleDomains for ${ownTenantId}`);
  }

  // ── Default: own tenant ───────────────────────────────────────────────────
  return {
    tenantId:          ownTenantId,
    activeDomainId:    activeDomainId,
    memberDomainIds:   null, // own tenant — no restriction
    isImpersonating:   false,
    impersonatedEmail: null,
    role:              'owner',
  };
}

// ---------------------------------------------------------------------------
// buildDomainFilter — produces a SQL AND clause that restricts rows to the
// domains a member has access to. Safe to interpolate: values come from the
// server-signed JWT, never from raw user input.
//
//   activeDomainId set  → filter to that single domain (takes priority)
//   memberDomainIds null → own tenant / impersonation, no restriction
//   memberDomainIds []   → member but no domains granted → AND 1=0 (empty result)
//   memberDomainIds [...] → restrict to IN list
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(id: string) {
  if (!UUID_RE.test(id)) throw new Error(`Invalid domain ID format: ${id}`);
}

export function buildDomainFilter(
  activeDomainId: string | null,
  memberDomainIds: string[] | null,
  column: string,
): string {
  if (activeDomainId) {
    assertUuid(activeDomainId);
    return `AND ${column} = '${activeDomainId}'`;
  }
  if (memberDomainIds === null) return '';
  if (memberDomainIds.length === 0) return 'AND 1=0';
  memberDomainIds.forEach(assertUuid);
  return `AND ${column} IN (${memberDomainIds.map(id => `'${id}'`).join(', ')})`;
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
