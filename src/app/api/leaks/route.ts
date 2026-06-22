import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { isPaywalled } from '@/lib/paywallCheck';
import { getEffectiveTenantId } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve effective tenant (supports admin impersonation)
    const { tenantId, activeDomainId, isImpersonating } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    if (!isImpersonating && await isPaywalled(tenantId)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 402 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const result = await withTenantDb(tenantId, async (req) => {
      req.input('startDate', mssql.DateTime, new Date(start));
      req.input('endDate', mssql.DateTime, new Date(end));

      const leaksResult = await req.query(`
        SELECT
          s.keyword,
          s.match_type,
          c.campaign_id,
          c.google_campaign_id,
          COALESCE(s.session_cpc, c.avg_cpc) as effective_cpc,
          COUNT(*) as total_clicks,
          SUM(CASE WHEN s.is_bounce = 1 THEN 1 ELSE 0 END) as bounce_clicks,
          CAST(SUM(CASE WHEN s.is_bounce = 1 THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 as bounce_rate,
          SUM(CASE WHEN s.is_bounce = 1 THEN 1 ELSE 0 END) * COALESCE(s.session_cpc, c.avg_cpc) as estimated_waste
        FROM Sessions s
        INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
        WHERE s.started_at >= @startDate
          AND s.started_at <= @endDate
          AND s.keyword IS NOT NULL
          AND s.keyword <> 'adleak_test'
          ${activeDomainId ? `AND c.domain_id = '${activeDomainId}'` : ''}
        GROUP BY s.keyword, s.match_type, c.campaign_id, c.google_campaign_id, COALESCE(s.session_cpc, c.avg_cpc)
        HAVING SUM(CASE WHEN s.is_bounce = 1 THEN 1 ELSE 0 END) > 0
        ORDER BY estimated_waste DESC
      `);

      const leaks = leaksResult.recordset.map(row => ({
        keyword: row.keyword,
        matchType: row.match_type,
        campaignId: row.campaign_id,
        googleCampaignId: row.google_campaign_id,
        avgCpc: row.effective_cpc,
        totalClicks: row.total_clicks,
        bounceClicks: row.bounce_clicks,
        bounceRate: Math.round(row.bounce_rate * 10) / 10,
        estimatedWaste: row.estimated_waste || 0,
      }));

      // Calculate totals
      const totalWaste = leaks.reduce((sum, leak) => sum + leak.estimatedWaste, 0);
      const totalBounceClicks = leaks.reduce((sum, leak) => sum + leak.bounceClicks, 0);

      return {
        leaks,
        summary: {
          totalWaste: Math.round(totalWaste * 100) / 100,
          totalBounceClicks,
          totalLeaks: leaks.length,
          dateRange: { start, end },
        },
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Leak table error:', error);
    return NextResponse.json({ error: 'Failed to fetch leak data' }, { status: 500 });
  }
}