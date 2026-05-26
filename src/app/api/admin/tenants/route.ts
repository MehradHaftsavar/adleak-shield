// =============================================================================
// AdLeak Shield — Admin Tenants List
// src/app/api/admin/tenants/route.ts
//
// GET: Returns all tenants with subscription status, session counts,
//      waste stats, trial expiry, and last activity.
//
// Owner-only. Returns 404 for non-owners.
// =============================================================================

import { NextResponse } from 'next/server';
import { requireOwner, ownerNotFound } from '@/lib/adminAuth';
import { withAdminDb } from '@/lib/db/client';

export async function GET() {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  try {
    const tenants = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT
          t.tenant_id,
          t.email,
          t.subscription_status,
          t.trial_ends_at,
          t.created_at,
          t.onboarding_completed,
          -- Session count (last 30 days)
          (
            SELECT COUNT(*)
            FROM Sessions s
            INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
            WHERE c.tenant_id = t.tenant_id
              AND s.started_at >= DATEADD(day, -30, GETUTCDATE())
          ) AS sessions_30d,
          -- Last session timestamp
          (
            SELECT MAX(s.started_at)
            FROM Sessions s
            INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
            WHERE c.tenant_id = t.tenant_id
          ) AS last_session_at,
          -- Estimated waste (last 30 days)
          (
            SELECT ISNULL(SUM(
              CASE WHEN s.is_bounce = 1
                   THEN COALESCE(s.session_cpc, camp.avg_cpc)
                   ELSE 0
              END
            ), 0)
            FROM Sessions s
            INNER JOIN Campaigns camp ON s.campaign_id = camp.campaign_id
            WHERE camp.tenant_id = t.tenant_id
              AND s.started_at >= DATEADD(day, -30, GETUTCDATE())
          ) AS waste_30d,
          -- Campaign count
          (
            SELECT COUNT(*)
            FROM Campaigns c
            WHERE c.tenant_id = t.tenant_id
          ) AS campaign_count
        FROM Tenants t
        WHERE t.email_verified = 1
        ORDER BY t.created_at DESC
      `);
      return r.recordset;
    });

    const result = tenants.map(t => ({
      tenantId:            t.tenant_id,
      email:               t.email,
      subscriptionStatus:  t.subscription_status ?? 'none',
      trialEndsAt:         t.trial_ends_at ? new Date(t.trial_ends_at).toISOString() : null,
      createdAt:           t.created_at ? new Date(t.created_at).toISOString() : null,
      onboardingCompleted: !!t.onboarding_completed,
      sessions30d:         Number(t.sessions_30d   ?? 0),
      lastSessionAt:       t.last_session_at ? new Date(t.last_session_at).toISOString() : null,
      waste30d:            Math.round(Number(t.waste_30d ?? 0) * 100) / 100,
      campaignCount:       Number(t.campaign_count ?? 0),
    }));

    return NextResponse.json({ tenants: result, count: result.length });
  } catch (err) {
    console.error('[Admin] Tenants list error:', err);
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
  }
}
