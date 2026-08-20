import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { isPaywalled } from '@/lib/paywallCheck';
import { getEffectiveTenantId, buildDomainFilter } from '@/lib/adminAuth';
import { SESSION_HAS_INTERACTION } from '@/lib/db/sessionDuration';

// Uses auth()/headers() — always request-time. Declaring this stops Next from
// attempting a build-time prerender probe (which threw DYNAMIC_SERVER_USAGE).
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve effective tenant (supports admin impersonation)
    const { tenantId, activeDomainId, memberDomainIds, isImpersonating } = await getEffectiveTenantId(
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

      // A click is wasted if the visitor left within seconds OR stayed and did
      // nothing at all. Commercially those are the same outcome — money spent,
      // nothing returned — and counting only the first quietly credited the
      // second to the keyword that produced it.
      //
      // The flag is worked out ONCE per session in the CTE rather than being
      // repeated inside three aggregates. SESSION_HAS_INTERACTION carries an
      // EXISTS over JourneyEvents, so evaluating it three times per row would
      // have tripled that scan for no reason.
      //
      // A converted session can never be wasted: success_event is one of the
      // event types SESSION_HAS_INTERACTION looks for, so it is excluded here
      // without needing a separate condition.
      const leaksResult = await req.query(`
        WITH sess AS (
          SELECT
            s.keyword,
            s.match_type,
            c.campaign_id,
            c.google_campaign_id,
            c.name AS campaign_name,
            COALESCE(s.session_cpc, c.avg_cpc) AS effective_cpc,
            CASE WHEN s.is_bounce = 1 OR NOT ${SESSION_HAS_INTERACTION}
                 THEN 1 ELSE 0 END AS is_wasted
          FROM Sessions s
          INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
          WHERE s.started_at >= @startDate
            AND s.started_at <= @endDate
            AND s.keyword IS NOT NULL
            AND s.keyword <> 'adleak_test'
            ${buildDomainFilter(activeDomainId, memberDomainIds, 'c.domain_id')}
        )
        SELECT
          keyword,
          match_type,
          campaign_id,
          google_campaign_id,
          campaign_name,
          effective_cpc,
          COUNT(*)          AS total_clicks,
          SUM(is_wasted)    AS wasted_clicks,
          CAST(SUM(is_wasted) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 AS wasted_rate,
          SUM(is_wasted) * effective_cpc AS estimated_waste
        FROM sess
        GROUP BY keyword, match_type, campaign_id, google_campaign_id, campaign_name, effective_cpc
        HAVING SUM(is_wasted) > 0
        ORDER BY estimated_waste DESC
      `);

      const leaks = leaksResult.recordset.map(row => ({
        keyword: row.keyword,
        matchType: row.match_type,
        campaignId: row.campaign_id,
        googleCampaignId: row.google_campaign_id,
        campaignName: row.campaign_name ?? null,
        avgCpc: row.effective_cpc,
        totalClicks: row.total_clicks,
        wastedClicks: row.wasted_clicks,
        wastedRate: Math.round(row.wasted_rate * 10) / 10,
        estimatedWaste: row.estimated_waste || 0,
      }));

      // Calculate totals
      const totalWaste = leaks.reduce((sum, leak) => sum + leak.estimatedWaste, 0);
      const totalWastedClicks = leaks.reduce((sum, leak) => sum + leak.wastedClicks, 0);

      return {
        leaks,
        summary: {
          totalWaste: Math.round(totalWaste * 100) / 100,
          totalWastedClicks,
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