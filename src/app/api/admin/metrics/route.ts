// =============================================================================
// AdLeak Shield — Admin Metrics API
// src/app/api/admin/metrics/route.ts
//
// Returns global platform metrics: user counts, MRR, total waste detected.
// Owner-only. Returns 404 for all non-owners (no 401/403).
//
// MRR: pulled from Stripe active + trialing subscriptions.
// Waste: SUM of estimated_waste across ALL tenants (admin DB — no RLS).
// =============================================================================

import { NextResponse } from 'next/server';
import { requireOwner, ownerNotFound } from '@/lib/adminAuth';
import { withAdminDb } from '@/lib/db/client';

export async function GET() {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  try {
    // -------------------------------------------------------------------------
    // 1. Pull user/tenant stats directly from SQL
    // -------------------------------------------------------------------------
    const stats = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT
          COUNT(*)                                                        AS total_tenants,
          SUM(CASE WHEN subscription_status = 'active'   THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN subscription_status = 'trialing' THEN 1 ELSE 0 END) AS trialing_count,
          SUM(CASE WHEN subscription_status = 'canceled'
               OR  subscription_status IS NULL             THEN 1 ELSE 0 END) AS inactive_count
        FROM Tenants
        WHERE email_verified = 1
      `);
      return r.recordset[0] ?? {};
    });

    // -------------------------------------------------------------------------
    // 2. Total waste detected across ALL tenants (no RLS — admin connection)
    //    We query Sessions + Campaigns directly.  RLS is off on admin conn.
    // -------------------------------------------------------------------------
    const wasteRow = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT
          ISNULL(SUM(
            CASE WHEN s.is_bounce = 1
                 THEN COALESCE(s.session_cpc, c.avg_cpc)
                 ELSE 0
            END
          ), 0) AS total_waste,
          COUNT(DISTINCT s.tenant_id) AS tenants_with_data
        FROM Sessions s
        INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
        WHERE s.started_at >= DATEADD(day, -30, GETUTCDATE())
      `);
      return r.recordset[0] ?? { total_waste: 0, tenants_with_data: 0 };
    });

    // -------------------------------------------------------------------------
    // 3. MRR from Stripe (optional — skip gracefully if key not set)
    // -------------------------------------------------------------------------
    let mrr = 0;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as never });

        // List active subscriptions and sum up monthly amounts
        const subs = await stripe.subscriptions.list({
          status: 'active',
          limit: 100,
          expand: ['data.plan'],
        });

        for (const sub of subs.data) {
          const item = sub.items.data[0];
          if (!item?.price) continue;
          const amount = item.price.unit_amount ?? 0;
          const interval = item.price.recurring?.interval;
          const intervalCount = item.price.recurring?.interval_count ?? 1;

          if (interval === 'month') {
            mrr += (amount / 100) / intervalCount;
          } else if (interval === 'year') {
            mrr += (amount / 100) / (12 * intervalCount);
          }
        }
        mrr = Math.round(mrr * 100) / 100;
      } catch (stripeErr) {
        console.warn('[Admin Metrics] Stripe MRR fetch failed:', stripeErr);
        mrr = 0;
      }
    }

    return NextResponse.json({
      tenants: {
        total:    Number(stats.total_tenants    ?? 0),
        active:   Number(stats.active_count     ?? 0),
        trialing: Number(stats.trialing_count   ?? 0),
        inactive: Number(stats.inactive_count   ?? 0),
      },
      mrr,
      waste30d: {
        total:          Math.round(Number(wasteRow.total_waste       ?? 0) * 100) / 100,
        tenantsWithData: Number(wasteRow.tenants_with_data ?? 0),
      },
    });
  } catch (err) {
    console.error('[Admin] Metrics error:', err);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
