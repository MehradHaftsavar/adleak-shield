import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { isPaywalled } from '@/lib/paywallCheck';
import { getEffectiveTenantId, buildDomainFilter } from '@/lib/adminAuth';

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
    const adGroupId  = searchParams.get('adGroupId')  || '';
    const adId       = searchParams.get('adId')       || '';
    const adPosition = searchParams.get('adPosition') || ''; // exact value e.g. "1t1"
    const country    = searchParams.get('country')    || ''; // ISO 3166-1 alpha-2, e.g. "GB"
    const startDate  = searchParams.get('start');
    const endDate    = searchParams.get('end');

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end   = endDate   || new Date().toISOString();

    // Pagination
    const pageParam     = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '50', 10);
    const page     = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100 ? pageSizeParam : 50;
    const offset   = (page - 1) * pageSize;

    // Sorting — whitelist columns to prevent SQL injection via sortKey/sortDir
    const SORT_COLUMNS: Record<string, string> = {
      keyword:   's.keyword',
      matchType: 's.match_type',
      date:      's.started_at',
      campaign:     'c.google_campaign_id',
      campaignName: 'c.name',
      device:    's.device',
      duration:  's.total_duration_ms',
      adGroup:   's.ad_group_id',
      adId:      's.ad_id',
      position:  's.ad_position',
      location:  's.city',
      country:   's.country',
      outcome:   `CASE WHEN EXISTS (SELECT 1 FROM JourneyEvents je WHERE je.session_id = s.session_id AND je.event_type = 'success_event') THEN 2 WHEN s.is_bounce = 1 THEN 0 ELSE 1 END`,
    };
    const sortKeyParam = searchParams.get('sortKey') || 'date';
    const sortColumn   = SORT_COLUMNS[sortKeyParam] || SORT_COLUMNS.date;
    const sortDir      = (searchParams.get('sortDir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const result = await withTenantDb(tenantId, async (req) => {
      req.input('startDate', mssql.DateTime, new Date(start));
      req.input('endDate',   mssql.DateTime, new Date(end));

      const conditions: string[] = [
        's.started_at >= @startDate',
        's.started_at <= @endDate',
        's.keyword IS NOT NULL',
        "s.keyword <> 'adleak_test'",
        ...(activeDomainId
          ? [`c.domain_id = '${activeDomainId}'`]
          : memberDomainIds === null
            ? []
            : memberDomainIds.length === 0
              ? ['1=0']
              : [`c.domain_id IN (${memberDomainIds.map(id => `'${id}'`).join(', ')})`]
        ),
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

      if (adGroupId) {
        req.input('adGroupId', mssql.NVarChar(20), adGroupId);
        conditions.push("s.ad_group_id LIKE '%' + @adGroupId + '%'");
      }

      if (adId) {
        req.input('adId', mssql.NVarChar(50), adId);
        conditions.push("s.ad_id LIKE '%' + @adId + '%'");
      }

      if (adPosition) {
        req.input('adPosition', mssql.NVarChar(20), adPosition);
        conditions.push('s.ad_position = @adPosition');
      }

      if (country) {
        req.input('country', mssql.NVarChar(2), country);
        conditions.push('s.country = @country');
      }

      const where = conditions.join(' AND ');

      const countResult = await req.query(`
        SELECT COUNT(*) AS total
        FROM Sessions s
        INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
        WHERE ${where}
      `);
      const total = countResult.recordset[0]?.total ?? 0;

      req.input('offsetVal',   mssql.Int, offset);
      req.input('pageSizeVal', mssql.Int, pageSize);

      const queryResult = await req.query(`
        SELECT
          s.session_id,
          s.keyword,
          s.match_type,
          s.device,
          s.started_at,
          s.total_duration_ms,
          s.is_bounce,
          s.ad_group_id,
          s.ad_id,
          s.ad_position,
          s.city,
          s.country,
          c.google_campaign_id,
          c.name AS campaign_name,
          c.campaign_id AS campaign_uuid,
          (
            SELECT COUNT(*) FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.event_type <> 'heartbeat'
          ) AS event_count,
          (
            SELECT COUNT(*) FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.event_type = 'success_event'
          ) AS success_count,
          (
            SELECT TOP 1 je.occurred_at FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.event_type <> 'heartbeat'
            ORDER BY COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', je.occurred_at)) ASC
          ) AS first_event_at
        FROM Sessions s
        INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
        WHERE ${where}
        ORDER BY ${sortColumn} ${sortDir}, s.session_id ${sortDir}
        OFFSET @offsetVal ROWS FETCH NEXT @pageSizeVal ROWS ONLY
      `);

      return {
        total,
        sessions: queryResult.recordset.map(row => ({
          sessionId:         row.session_id,
          keyword:           row.keyword,
          matchType:         row.match_type,
          device:            row.device,
          startedAt:         row.first_event_at ?? row.started_at,
          totalDurationMs:   row.total_duration_ms,
          isBounce:          row.is_bounce === true || row.is_bounce === 1,
          adGroupId:         row.ad_group_id  ?? null,
          adId:              row.ad_id        ?? null,
          adPosition:        row.ad_position  ?? null,
          city:              row.city         ?? null,
          country:           row.country      ?? null,
          googleCampaignId:  row.google_campaign_id,
          campaignName:      row.campaign_name ?? null,
          campaignId:        row.campaign_uuid,
          eventCount:        row.event_count,
          hasSuccessEvent:   row.success_count > 0,
        })),
      };
    });

    return NextResponse.json({ sessions: result.sessions, total: result.total });
  } catch (error) {
    console.error('Sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
