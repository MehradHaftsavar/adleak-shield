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
    const { tenantId, isImpersonating } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    // Skip paywall check when admin is impersonating (owner has no paywall)
    if (!isImpersonating && await isPaywalled(tenantId)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 402 });
    }

    const { searchParams } = new URL(request.url);
    const keyword    = searchParams.get('keyword')    || '';
    const campaignId = searchParams.get('campaignId') || '';
    const matchType  = searchParams.get('matchType')  || '';
    const device     = searchParams.get('device')     || '';
    const outcome    = searchParams.get('outcome')    || '';
    const startDate  = searchParams.get('start');
    const endDate    = searchParams.get('end');

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end   = endDate   || new Date().toISOString();

    const result = await withTenantDb(tenantId, async (req) => {
      req.input('startDate', mssql.DateTime, new Date(start));
      req.input('endDate',   mssql.DateTime, new Date(end));

      const conditions: string[] = [
        's.started_at >= @startDate',
        's.started_at <= @endDate',
        's.keyword IS NOT NULL',
      ];

      if (keyword) {
        req.input('keyword', mssql.NVarChar(255), keyword);
        conditions.push("s.keyword LIKE '%' + @keyword + '%'");
      }

      if (campaignId) {
        req.input('campaignId', mssql.UniqueIdentifier, campaignId);
        conditions.push('s.campaign_id = @campaignId');
      }

      if (matchType) {
        req.input('matchType', mssql.NVarChar(20), matchType);
        conditions.push('s.match_type = @matchType');
      }

      if (device) {
        req.input('device', mssql.NVarChar(20), device);
        conditions.push('s.device = @device');
      }

      if (outcome === 'bounce') {
        conditions.push('s.is_bounce = 1');
      } else if (outcome === 'converted') {
        conditions.push(`EXISTS (
          SELECT 1 FROM JourneyEvents je
          WHERE je.session_id = s.session_id AND je.event_type = 'success_event'
        )`);
      } else if (outcome === 'engaged') {
        conditions.push('s.is_bounce = 0');
        conditions.push(`NOT EXISTS (
          SELECT 1 FROM JourneyEvents je
          WHERE je.session_id = s.session_id AND je.event_type = 'success_event'
        )`);
      }

      const where = conditions.join(' AND ');

      const queryResult = await req.query(`
        SELECT TOP 100
          s.session_id,
          s.keyword,
          s.match_type,
          s.device,
          s.started_at,
          s.total_duration_ms,
          s.is_bounce,
          c.google_campaign_id,
          c.campaign_id AS campaign_uuid,
          (
            SELECT COUNT(*) FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.event_type <> 'heartbeat'
          ) AS event_count,
          (
            SELECT COUNT(*) FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.event_type = 'success_event'
          ) AS success_count
        FROM Sessions s
        INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
        WHERE ${where}
        ORDER BY s.started_at DESC
      `);

      return queryResult.recordset.map(row => ({
        sessionId:         row.session_id,
        keyword:           row.keyword,
        matchType:         row.match_type,
        device:            row.device,
        startedAt:         row.started_at,
        totalDurationMs:   row.total_duration_ms,
        isBounce:          row.is_bounce === true || row.is_bounce === 1,
        googleCampaignId:  row.google_campaign_id,
        campaignId:        row.campaign_uuid,
        eventCount:        row.event_count,
        hasSuccessEvent:   row.success_count > 0,
      }));
    });

    return NextResponse.json({ sessions: result });
  } catch (error) {
    console.error('Sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
