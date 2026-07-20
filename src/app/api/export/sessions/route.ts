import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import { getEffectiveTenantId, buildDomainFilter } from '@/lib/adminAuth';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId, activeDomainId, memberDomainIds } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    const domainFilter = buildDomainFilter(activeDomainId, memberDomainIds, 'c.domain_id');

    const { searchParams } = new URL(request.url);
    const start      = searchParams.get('start')      || '1970-01-01';
    const end        = searchParams.get('end')         || new Date().toISOString().slice(0, 10);
    const keyword    = searchParams.get('keyword')     || null;
    const campaignId = searchParams.get('campaignId') || null;
    const matchType  = searchParams.get('matchType')  || null;
    const device     = searchParams.get('device')     || null;
    const outcome    = searchParams.get('outcome')    || null;
    const adGroupId  = searchParams.get('adGroupId')  || null;
    const adId       = searchParams.get('adId')       || null;
    const adPosition = searchParams.get('adPosition') || null;
    const country    = searchParams.get('country')    || null;

    const rows = await withTenantDb(tenantId, async (req) => {
      req.input('start',      start + 'T00:00:00Z');
      req.input('end',        end   + 'T23:59:59Z');
      req.input('keyword',    mssql.NVarChar(200), keyword);
      req.input('campaignId', mssql.NVarChar(36),  campaignId);
      req.input('matchType',  mssql.NVarChar(50),  matchType);
      req.input('device',     mssql.NVarChar(50),  device);
      req.input('outcome',    mssql.NVarChar(20),  outcome);
      req.input('adGroupId',  mssql.NVarChar(100), adGroupId);
      req.input('adId',       mssql.NVarChar(100), adId);
      req.input('adPosition', mssql.NVarChar(50),  adPosition);
      req.input('country',    mssql.NVarChar(10),  country);

      const result = await req.query(`
        SELECT
          s.session_id,
          s.keyword,
          s.match_type,
          s.device,
          s.started_at,
          s.total_duration_ms,
          s.is_bounce,
          s.city,
          s.country,
          s.ip_masked,
          s.gclid,
          s.ad_group_id,
          s.ad_id,
          s.ad_position,
          c.google_campaign_id,
          c.slot_number,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM JourneyEvents je
              WHERE je.session_id = s.session_id AND je.event_type = 'success_event'
            ) THEN 'Converted'
            WHEN s.is_bounce = 1 THEN 'Bounce'
            ELSE 'Engaged'
          END AS outcome
        FROM Sessions s
        LEFT JOIN Campaigns c ON c.campaign_id = s.campaign_id
        WHERE s.started_at >= @start
          AND s.started_at <= @end
          ${domainFilter}
          AND (@keyword    IS NULL OR s.keyword       LIKE '%' + @keyword + '%')
          AND (@campaignId IS NULL OR s.campaign_id   = CAST(@campaignId AS UNIQUEIDENTIFIER))
          AND (@matchType  IS NULL OR s.match_type    = @matchType)
          AND (@device     IS NULL OR LOWER(s.device) = LOWER(@device))
          AND (@adGroupId  IS NULL OR s.ad_group_id   = @adGroupId)
          AND (@adId       IS NULL OR s.ad_id         = @adId)
          AND (@adPosition IS NULL OR s.ad_position   = @adPosition)
          AND (@country    IS NULL OR s.country        = @country)
          AND (
            @outcome IS NULL
            OR (@outcome = 'converted' AND EXISTS (
                SELECT 1 FROM JourneyEvents je
                WHERE je.session_id = s.session_id AND je.event_type = 'success_event'))
            OR (@outcome = 'bounce' AND s.is_bounce = 1 AND NOT EXISTS (
                SELECT 1 FROM JourneyEvents je
                WHERE je.session_id = s.session_id AND je.event_type = 'success_event'))
            OR (@outcome = 'engaged' AND s.is_bounce = 0 AND NOT EXISTS (
                SELECT 1 FROM JourneyEvents je
                WHERE je.session_id = s.session_id AND je.event_type = 'success_event'))
          )
        ORDER BY s.started_at DESC
      `);
      return result.recordset;
    });

    const header = 'Session ID,Keyword,Match Type,Device,Date,Duration (ms),Outcome,City,Country,Campaign ID,Slot,Ad Group ID,Ad ID,Ad Position,IP (masked),GCLID';
    const csvRows = rows.map((r: any) =>
      [
        escapeCsv(r.session_id),
        escapeCsv(r.keyword),
        escapeCsv(r.match_type),
        escapeCsv(r.device),
        escapeCsv(r.started_at ? new Date(r.started_at).toISOString() : ''),
        escapeCsv(r.total_duration_ms),
        escapeCsv(r.outcome),
        escapeCsv(r.city),
        escapeCsv(r.country),
        escapeCsv(r.google_campaign_id),
        escapeCsv(r.slot_number),
        escapeCsv(r.ad_group_id),
        escapeCsv(r.ad_id),
        escapeCsv(r.ad_position),
        escapeCsv(r.ip_masked),
        escapeCsv(r.gclid),
      ].join(',')
    );

    const csv = [header, ...csvRows].join('\n');
    const filename = `sessions_${start}_to_${end}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[export/sessions]', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
