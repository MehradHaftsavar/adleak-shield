// =============================================================================
// AdLeak Shield — Admin Metrics API
// src/app/api/admin/metrics/route.ts
//
// Returns global platform metrics: user counts, MRR, total waste detected.
//
// FIX: Sessions/Campaigns are RLS-protected. withAdminDb has no SESSION_CONTEXT
// so those tables return 0 rows. We iterate per-tenant using withTenantDb.
//
// Accepts ?start=ISO&end=ISO query params (defaults to last 30 days).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, ownerNotFound } from '@/lib/adminAuth';
import { withAdminDb, withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  const { searchParams } = new URL(request.url);
  const end   = searchParams.get('end')   || new Date().toISOString();
  const start = searchParams.get('start') || new Date(new Date(end).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // -------------------------------------------------------------------------
    // 1. Tenant counts — Tenants table has no RLS, withAdminDb is fine
    // -------------------------------------------------------------------------
    const stats = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT
          COUNT(*)                                                             AS total_tenants,
          SUM(CASE WHEN subscription_status = 'active'   THEN 1 ELSE 0 END)  AS active_count,
          SUM(CASE WHEN subscription_status = 'trialing' THEN 1 ELSE 0 END)  AS trialing_count,
          SUM(CASE WHEN subscription_status NOT IN ('active','trialing')
               OR  subscription_status IS NULL                THEN 1 ELSE 0 END) AS inactive_count
        FROM Tenants
        WHERE email_verified = 1
      `);
      return r.recordset[0] ?? {};
    });

    // -------------------------------------------------------------------------
    // 2. Waste across all tenants — must use withTenantDb per tenant (RLS fix)
    //    Get all tenant IDs first, then aggregate with proper RLS context.
    // -------------------------------------------------------------------------
    const tenantIds = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT tenant_id FROM Tenants WHERE email_verified = 1
      `);
      return r.recordset.map(t => t.tenant_id as string);
    });

    let totalWaste      = 0;
    let tenantsWithData = 0;

    for (const tenantId of tenantIds) {
      try {
        const waste = await withTenantDb(tenantId, async (req) => {
          req.input('start', mssql.DateTime, new Date(start));
          req.input('end',   mssql.DateTime, new Date(end));
          const r = await req.query(`
            SELECT ISNULL(SUM(
              CASE WHEN s.is_bounce = 1
                   THEN COALESCE(s.session_cpc, c.avg_cpc)
                   ELSE 0
              END
            ), 0) AS waste
            FROM Sessions s
            INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
            WHERE s.started_at >= @start
              AND s.started_at <= @end
          `);
          return Number(r.recordset[0]?.waste ?? 0);
        });

        totalWaste += waste;
        if (waste > 0) tenantsWithData++;
      } catch {
        // Skip tenant on error — don't let one bad tenant block the rest
      }
    }

    // -------------------------------------------------------------------------
    // 3. MRR from Stripe (optional — skip gracefully if key not set)
    // -------------------------------------------------------------------------
    let mrr = 0;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as never });

        const subs = await stripe.subscriptions.list({
          status: 'active',
          limit: 100,
          expand: ['data.plan'],
        });

        for (const sub of subs.data) {
          const item = sub.items.data[0];
          if (!item?.price) continue;
          const amount        = item.price.unit_amount ?? 0;
          const interval      = item.price.recurring?.interval;
          const intervalCount = item.price.recurring?.interval_count ?? 1;

          if (interval === 'month')      mrr += (amount / 100) / intervalCount;
          else if (interval === 'year')  mrr += (amount / 100) / (12 * intervalCount);
        }
        mrr = Math.round(mrr * 100) / 100;
      } catch (stripeErr) {
        console.warn('[Admin Metrics] Stripe MRR fetch failed:', stripeErr);
      }
    }

    return NextResponse.json({
      tenants: {
        total:    Number(stats.total_tenants   ?? 0),
        active:   Number(stats.active_count    ?? 0),
        trialing: Number(stats.trialing_count  ?? 0),
        inactive: Number(stats.inactive_count  ?? 0),
      },
      mrr,
      waste: {
        total:           Math.round(totalWaste * 100) / 100,
        tenantsWithData,
      },
      dateRange: { start, end },
    });
  } catch (err) {
    console.error('[Admin] Metrics error:', err);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
