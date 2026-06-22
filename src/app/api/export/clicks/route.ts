import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import { getEffectiveTenantId } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function escapeCsv(value: string | number | boolean | null | undefined): string {
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
          cl.click_id,
          cl.keyword,
          cl.match_type,
          cl.landing_page_path,
          cl.clicked_at,
          cl.estimated_cpc_gbp,
          cl.is_validated,
          cl.validation_failure_reason,
          cl.session_duration,
          c.google_campaign_id,
          c.slot_number
        FROM ClickLogs cl
        LEFT JOIN Campaigns c ON c.campaign_id = cl.campaign_id
        WHERE cl.clicked_at >= @start AND cl.clicked_at <= @end
        ORDER BY cl.clicked_at DESC
      `);
      return result.recordset;
    });

    const header = 'Click ID,Keyword,Match Type,Landing Page,Clicked At,Est. CPC (£),Validated,Failure Reason,Session Duration (ms),Campaign ID,Slot';
    const csvRows = rows.map((r: any) =>
      [
        escapeCsv(r.click_id),
        escapeCsv(r.keyword),
        escapeCsv(r.match_type),
        escapeCsv(r.landing_page_path),
        escapeCsv(r.clicked_at ? new Date(r.clicked_at).toISOString() : ''),
        escapeCsv(r.estimated_cpc_gbp),
        escapeCsv(r.is_validated ? 'Yes' : 'No'),
        escapeCsv(r.validation_failure_reason),
        escapeCsv(r.session_duration),
        escapeCsv(r.google_campaign_id),
        escapeCsv(r.slot_number),
      ].join(',')
    );

    const csv = [header, ...csvRows].join('\n');
    const filename = `clicks_${start}_to_${end}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[export/clicks]', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
