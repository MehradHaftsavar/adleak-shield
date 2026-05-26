// =============================================================================
// AdLeak Shield — Admin: Stop Impersonation
// src/app/api/admin/impersonate/stop/route.ts
//
// POST — clears both als_imp and als_imp_label cookies, returning the admin
//         back to their own account view.
//
// Owner-only. Returns 404 for non-owners.
// =============================================================================

import { NextResponse } from 'next/server';
import { requireOwner, ownerNotFound, IMP_COOKIE, IMP_LABEL_COOKIE } from '@/lib/adminAuth';

export async function POST() {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  const response = NextResponse.json({ success: true });

  // Clear both cookies by setting maxAge to 0
  response.cookies.set(IMP_COOKIE, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   0,
  });

  response.cookies.set(IMP_LABEL_COOKIE, '', {
    httpOnly: false,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   0,
  });

  return response;
}
