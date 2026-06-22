import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import { getEffectiveTenantId } from '@/lib/adminAuth';

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

    const { tenantId } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || '1970-01-01';
    const end   = searchParams.get('end')   || new Date().toISOString().slice(0, 10);

    const rows = await withTenantDb(tenantId, async (req) => {
      req.input('start', start + 'T00:00:00Z');
      req.input('end',   end   + 'T23:59:59Z');
      const result = await req.query(`
        SELECT
          s.session_id,
          s.keyword,
          s.match_type,
          s.device,
          s.started_at,
          s.total_duration_ms,
          s.is_bounce,
          s.ip_masked,
          s.gclid,
          c.google_campaign_id,
          c.slot_number,
          CASE WHEN EXISTS (
            SELECT 1 FROM JourneyEvents je
            WHERE je.session_id = s.session_id AND je.is_success_event = 1
          ) THEN 'Converted' ELSE CASE WHEN s.is_bounce = 1 THEN 'Bounce' ELSE 'Engaged' END END AS outcome
        FROM Sessions s
        LEFT JOIN Campaigns c ON c.campaign_id = s.campaign_id
        WHERE s.started_at >= @start AND s.started_at <= @end
        ORDER BY s.started_at DESC
      `);
      return result.recordset;
    });

    const header = 'Session ID,Keyword,Match Type,Device,Date,Duration (ms),Outcome,Campaign ID,Slot,IP (masked),GCLID';
    const csvRows = rows.map((r: any) =>
      [
        escapeCsv(r.session_id),
        escapeCsv(r.keyword),
        escapeCsv(r.match_type),
        escapeCsv(r.device),
        escapeCsv(r.started_at ? new Date(r.started_at).toISOString() : ''),
        escapeCsv(r.total_duration_ms),
        escapeCsv(r.outcome),
        escapeCsv(r.google_campaign_id),
        escapeCsv(r.slot_number),
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
