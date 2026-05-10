import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      req.input('sessionId', mssql.UniqueIdentifier, sessionId);

      const sessionResult = await req.query(`
        SELECT
          s.session_id,
          s.keyword,
          s.match_type,
          s.device,
          s.started_at,
          s.total_duration_ms,
          s.is_bounce
        FROM Sessions s
        WHERE s.session_id = @sessionId
      `);

      if (sessionResult.recordset.length === 0) {
        return null;
      }

      const sessionRow = sessionResult.recordset[0];

      const eventsResult = await req.query(`
        SELECT
          event_id,
          event_type,
          page_path,
          element_tag,
          element_href,
          scroll_depth_pct,
          dwell_time_ms,
          occurred_at
        FROM JourneyEvents
        WHERE session_id = @sessionId
          AND event_type <> 'heartbeat'
        ORDER BY occurred_at ASC
      `);

      return {
        session: {
          sessionId:       sessionRow.session_id,
          keyword:         sessionRow.keyword,
          matchType:       sessionRow.match_type,
          device:          sessionRow.device,
          startedAt:       sessionRow.started_at,
          totalDurationMs: sessionRow.total_duration_ms,
          isBounce:        sessionRow.is_bounce === true || sessionRow.is_bounce === 1,
        },
        events: eventsResult.recordset.map(row => ({
          eventId:        row.event_id,
          eventType:      row.event_type,
          pagePath:       row.page_path,
          elementTag:     row.element_tag,
          elementHref:    row.element_href,
          scrollDepthPct: row.scroll_depth_pct,
          dwellTimeMs:    row.dwell_time_ms,
          occurredAt:     row.occurred_at,
        })),
      };
    });

    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Journey detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch journey' }, { status: 500 });
  }
}
