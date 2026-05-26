import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getEffectiveTenantId } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyword   = searchParams.get('keyword');
    const startDate = searchParams.get('start');
    const endDate   = searchParams.get('end');

    if (!keyword) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end   = endDate   || new Date().toISOString();

    const { tenantId } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    const result = await withTenantDb(tenantId, async (req) => {
      req.input('keyword',   mssql.NVarChar(255), keyword);
      req.input('startDate', mssql.DateTime,      new Date(start));
      req.input('endDate',   mssql.DateTime,      new Date(end));

      const queryResult = await req.query(`
        SELECT
          s.session_id,
          s.keyword,
          s.match_type,
          s.device,
          s.started_at,
          s.total_duration_ms,
          s.is_bounce,
          (
            SELECT COUNT(*)
            FROM JourneyEvents je
            WHERE je.session_id = s.session_id
              AND je.event_type <> 'heartbeat'
          ) AS event_count,
          (
            SELECT COUNT(*)
            FROM JourneyEvents je
            WHERE je.session_id = s.session_id
              AND je.event_type = 'success_event'
          ) AS success_count
        FROM Sessions s
        WHERE s.keyword     = @keyword
          AND s.started_at >= @startDate
          AND s.started_at <= @endDate
        ORDER BY s.started_at DESC
      `);

      return queryResult.recordset.map(row => ({
        sessionId:       row.session_id,
        keyword:         row.keyword,
        matchType:       row.match_type,
        device:          row.device,
        startedAt:       row.started_at,
        totalDurationMs: row.total_duration_ms,
        isBounce:        row.is_bounce === true || row.is_bounce === 1,
        eventCount:      row.event_count,
        hasSuccessEvent: row.success_count > 0,
      }));
    });

    return NextResponse.json({ sessions: result });
  } catch (error) {
    console.error('Journey sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
