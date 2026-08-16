import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { isPaywalled } from '@/lib/paywallCheck';
import { getEffectiveTenantId, buildDomainFilter } from '@/lib/adminAuth';
import { SESSION_DURATION_MS } from '@/lib/db/sessionDuration';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (await isPaywalled(session.user.tenantId as string)) {
      return NextResponse.json({ error: 'Subscription required' }, { status: 402 });
    }

    const { sessionId } = await params;
    const { tenantId, activeDomainId, memberDomainIds } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    const domainFilter = buildDomainFilter(activeDomainId, memberDomainIds, 'c.domain_id');

    const result = await withTenantDb(tenantId, async (req) => {
      req.input('sessionId', mssql.UniqueIdentifier, sessionId);

      const sessionResult = await req.query(`
        SELECT
          s.session_id,
          s.keyword,
          s.match_type,
          s.device,
          s.started_at,
          ${SESSION_DURATION_MS} AS total_duration_ms,
          s.is_bounce,
          s.max_scroll_pct,
          CASE WHEN EXISTS (
            SELECT 1 FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.event_type = 'success_event'
          ) THEN 1 ELSE 0 END AS has_success_event,
          -- Smallest gap between the browser's clock and ours across this
          -- session. The least-delayed event is the most trustworthy reference:
          -- occurred_at is stamped when the Function handler runs, which a cold
          -- start can push seconds late (squashing a 20s visit into one second).
          -- Adding this offset back to each event's client_ts restores real
          -- spacing, and self-corrects a wrong device clock at the same time.
          (
            SELECT MIN(DATEDIFF_BIG(MILLISECOND, '19700101', je.occurred_at) - je.client_ts)
            FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.client_ts IS NOT NULL
          ) AS min_lag_ms
        FROM Sessions s
        INNER JOIN Campaigns c ON c.campaign_id = s.campaign_id
        WHERE s.session_id = @sessionId
          ${domainFilter}
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
          element_text,
          scroll_depth_pct,
          dwell_time_ms,
          occurred_at,
          client_ts
        FROM JourneyEvents
        WHERE session_id = @sessionId
          AND event_type <> 'heartbeat'
        ORDER BY COALESCE(client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', occurred_at)) ASC
      `);

      // Rebuild each event's timestamp from the browser's own clock plus the
      // session's smallest observed server lag. Falls back to the raw
      // occurred_at whenever client_ts is missing (any event recorded before
      // that column existed), so historical journeys render exactly as before.
      const minLagMs = sessionRow.min_lag_ms;
      const displayTime = (occurredAt: Date, clientTs: unknown): Date => {
        if (clientTs == null || minLagMs == null) return occurredAt;
        return new Date(Number(clientTs) + Number(minLagMs));
      };

      // Use the first real event's time (already sorted client_ts-first, above)
      // rather than started_at, which is just when the DB row was inserted —
      // that can lag the visitor's actual landing moment by a few seconds.
      const firstEvent = eventsResult.recordset[0];
      const firstEventAt = firstEvent
        ? displayTime(firstEvent.occurred_at, firstEvent.client_ts)
        : sessionRow.started_at;

      return {
        session: {
          sessionId:       sessionRow.session_id,
          keyword:         sessionRow.keyword,
          matchType:       sessionRow.match_type,
          device:          sessionRow.device,
          startedAt:       firstEventAt,
          totalDurationMs: sessionRow.total_duration_ms,
          isBounce:        sessionRow.is_bounce === true || sessionRow.is_bounce === 1,
          hasSuccessEvent: sessionRow.has_success_event === true || sessionRow.has_success_event === 1,
          maxScrollPct:    sessionRow.max_scroll_pct ?? null,
        },
        events: eventsResult.recordset.map(row => ({
          eventId:        row.event_id,
          eventType:      row.event_type,
          pagePath:       row.page_path,
          elementTag:     row.element_tag,
          elementHref:    row.element_href,
          elementText:    row.element_text,
          scrollDepthPct: row.scroll_depth_pct,
          dwellTimeMs:    row.dwell_time_ms,
          occurredAt:     displayTime(row.occurred_at, row.client_ts),
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
