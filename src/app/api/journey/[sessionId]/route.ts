import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { isPaywalled } from '@/lib/paywallCheck';
import { getEffectiveTenantId, buildDomainFilter } from '@/lib/adminAuth';
import { SESSION_DURATION_MS } from '@/lib/db/sessionDuration';
import { MEANINGFUL_SCROLL_PCT } from '@/lib/sessionRules';

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
          -- Did the visitor actually DO anything, as opposed to merely being
          -- present? Drives the "No interaction" badge. Deliberately derived
          -- here rather than stored: is_bounce is read by the leaks report,
          -- the CSV export, both admin routes and the weekly email, so its
          -- meaning cannot be changed without moving a customer-facing money
          -- figure.
          CASE WHEN EXISTS (
                 SELECT 1 FROM JourneyEvents je
                 WHERE je.session_id = s.session_id
                   AND je.event_type IN ('click', 'success_event', 'form_interact')
               ) OR ISNULL(s.max_scroll_pct, 0) >= ${MEANINGFUL_SCROLL_PCT}
            THEN 1 ELSE 0 END AS has_interaction,
          -- The last thing we heard, of any kind — heartbeats included, which
          -- the events query below filters out. Without this the closing line
          -- could not know when the visit actually stopped, only when the last
          -- CLICKABLE step happened, which is often minutes earlier.
          (
            SELECT TOP 1 je.occurred_at FROM JourneyEvents je
            WHERE je.session_id = s.session_id
            ORDER BY COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', je.occurred_at)) DESC
          ) AS last_event_at,
          (
            SELECT TOP 1 je.client_ts FROM JourneyEvents je
            WHERE je.session_id = s.session_id
            ORDER BY COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', je.occurred_at)) DESC
          ) AS last_event_client_ts,
          -- Time spent on the final page: the LARGEST dwell recorded on it, not
          -- the most recent one.
          --
          -- The newest heartbeat is usually worthless. When a page ends, the
          -- tracker banks its time via page_end and then a final visibility
          -- flush lands a moment later reporting whatever is left over — dwell
          -- of 1, 3, 4ms. Taking the newest row gave "1ms on this page" on
          -- almost every session. dwell_time_ms is cumulative for its own page,
          -- so the peak is that page's real total.
          -- Bounded to heartbeats since the visitor's MOST RECENT arrival on
          -- that page, not every heartbeat it ever had. A journey that goes
          -- / -> /contact -> back to / has two separate stretches on "/", and
          -- without this bound a 60-second first visit would be reported as the
          -- time spent during a 5-second return.
          (
            SELECT MAX(je.dwell_time_ms) FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.event_type = 'heartbeat'
              AND je.page_path = (
                SELECT TOP 1 je2.page_path FROM JourneyEvents je2
                WHERE je2.session_id = s.session_id AND je2.event_type = 'heartbeat'
                ORDER BY COALESCE(je2.client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', je2.occurred_at)) DESC
              )
              AND COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', je.occurred_at))
                  >= ISNULL((
                       SELECT MAX(COALESCE(je3.client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', je3.occurred_at)))
                       FROM JourneyEvents je3
                       WHERE je3.session_id = s.session_id AND je3.event_type = 'pageview'
                     ), 0)
          ) AS last_page_ms,
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
          hasInteraction:  sessionRow.has_interaction === true || sessionRow.has_interaction === 1,
          maxScrollPct:    sessionRow.max_scroll_pct ?? null,
          // Same browser-clock correction as every other time on this screen,
          // so the closing line can't drift from the steps above it.
          endedAt:         sessionRow.last_event_at
            ? displayTime(sessionRow.last_event_at, sessionRow.last_event_client_ts)
            : null,
          lastPageMs:      sessionRow.last_page_ms ?? null,
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
