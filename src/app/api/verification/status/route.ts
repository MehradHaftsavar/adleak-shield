import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceParam = searchParams.get('workspace');

    // Invited workspace branch — check that workspace's Sessions table
    if (workspaceParam && workspaceParam !== session.user.tenantId) {
      const allAccessible = (session.user.allAccessibleDomains ?? []) as Array<{ tenantId: string }>;
      const hasAccess = allAccessible.some(d => d.tenantId === workspaceParam);
      if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

      const result = await withTenantDb(workspaceParam, async (req) => {
        const testResult = await req.query(`
          SELECT TOP 1 started_at FROM Sessions
          WHERE keyword = 'adleak_test'
            AND started_at >= DATEADD(second, -90, GETUTCDATE())
          ORDER BY started_at DESC
        `);
        return { snippetInstalled: testResult.recordset.length > 0 };
      });
      return NextResponse.json(result);
    }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Get registered campaigns count
      const campaignsResult = await req.query(`
        SELECT COUNT(*) as count FROM Campaigns
      `);
      const campaignCount = campaignsResult.recordset[0].count;

      let hasRecentData = false;
      let latestTest = null;

      // -----------------------------------------------------------------------
      // Check Sessions for a recent adleak_test row from this tenant.
      // The test event now writes to the DB like any real session — the worker
      // no longer drops it early. We just filter it from all display queries.
      // Checking the DB is reliable; the old queue-peek approach raced the
      // worker and lost every time (message gone in <1s, poll runs at 2s).
      // -----------------------------------------------------------------------
      const testResult = await req.query(`
        SELECT TOP 1 started_at
        FROM Sessions
        WHERE keyword = 'adleak_test'
          AND started_at >= DATEADD(second, -90, GETUTCDATE())
        ORDER BY started_at DESC
      `);

      if (testResult.recordset.length > 0) {
        hasRecentData = true;
        latestTest = {
          keyword: 'adleak_test',
          timestamp: testResult.recordset[0].started_at,
        };
      }

      return {
        snippetInstalled: hasRecentData,
        campaignsRegistered: campaignCount > 0,
        campaignCount: campaignCount,
        latestTest: latestTest,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification status error:', error);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}