import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { isPaywalled } from '@/lib/paywallCheck';
import { getEffectiveTenantId, buildDomainFilter } from '@/lib/adminAuth';

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
          s.total_duration_ms,
          s.is_bounce
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
          elementText:    row.element_text,
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
