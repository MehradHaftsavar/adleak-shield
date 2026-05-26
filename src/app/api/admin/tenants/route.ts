// =============================================================================
// AdLeak Shield — Admin Tenants List
// src/app/api/admin/tenants/route.ts
//
// GET: Returns all tenants with per-tenant stats (sessions, waste, campaigns).
//
// FIX: Sessions/Campaigns are RLS-protected. We must use withTenantDb per
//      tenant to get accurate stats — withAdminDb returns 0 rows from those
//      tables because SESSION_CONTEXT is not set.
//
// Accepts ?start=ISO&end=ISO query params (defaults to last 30 days).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, ownerNotFound } from '@/lib/adminAuth';
import { withAdminDb, withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export async function GET(request: NextRequest) {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  const { searchParams } = new URL(request.url);
  const end   = searchParams.get('end')   || new Date().toISOString();
  const start = searchParams.get('start') || new Date(new Date(end).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // -------------------------------------------------------------------------
    // Step 1: Get all tenant metadata — Tenants table has no RLS
    // -------------------------------------------------------------------------
    const tenantMeta = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT
          tenant_id,
          email,
          subscription_status,
          trial_ends_at,
          created_at,
          onboarding_completed
        FROM Tenants
        WHERE email_verified = 1
        ORDER BY created_at DESC
      `);
      return r.recordset;
    });

    // -------------------------------------------------------------------------
    // Step 2: Per-tenant stats using withTenantDb (sets RLS context correctly)
    //         Sequential to avoid exhausting the connection pool
    // -------------------------------------------------------------------------
    const tenants = [];

    for (const t of tenantMeta) {
      let stats = {
        sessionsInRange: 0,
        lastSessionAt:   null as string | null,
        waste:           0,
        campaignCount:   0,
      };

      try {
        const result = await withTenantDb(t.tenant_id, async (req) => {
          req.input('start', mssql.DateTime, new Date(start));
          req.input('end',   mssql.DateTime, new Date(end));

          const r = await req.query(`
            SELECT
              COUNT(s.session_id) AS sessions_count,
              MAX(s.started_at)   AS last_session_at,
              ISNULL(SUM(
                CASE WHEN s.is_bounce = 1
                     THEN COALESCE(s.session_cpc, c.avg_cpc)
                     ELSE 0
                END
              ), 0) AS waste,
              (SELECT COUNT(*) FROM Campaigns) AS campaign_count
            FROM Sessions s
            INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
            WHERE s.started_at >= @start
              AND s.started_at <= @end
          `);

          const row = r.recordset[0];
          return {
            sessionsInRange: Number(row?.sessions_count ?? 0),
            lastSessionAt:   row?.last_session_at ? new Date(row.last_session_at).toISOString() : null,
            waste:           Math.round(Number(row?.waste ?? 0) * 100) / 100,
            campaignCount:   Number(row?.campaign_count ?? 0),
          };
        });

        stats = result;
      } catch {
        // Skip stats for this tenant on error — still include them in the list
      }

      tenants.push({
        tenantId:            t.tenant_id as string,
        email:               t.email as string,
        subscriptionStatus:  (t.subscription_status as string) ?? 'none',
        trialEndsAt:         t.trial_ends_at ? new Date(t.trial_ends_at).toISOString() : null,
        createdAt:           t.created_at    ? new Date(t.created_at).toISOString()    : null,
        onboardingCompleted: !!t.onboarding_completed,
        ...stats,
      });
    }

    return NextResponse.json({
      tenants,
      count:     tenants.length,
      dateRange: { start, end },
    });
  } catch (err) {
    console.error('[Admin] Tenants list error:', err);
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
  }
}
