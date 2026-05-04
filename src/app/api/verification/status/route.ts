import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Check if we received ANY data in the last 60 seconds
      // This catches test data sent by the snippet
      const recentDataResult = await req.query(`
        SELECT TOP 1 
          session_id,
          keyword,
          campaign_id,
          started_at
        FROM Sessions
        WHERE started_at >= DATEADD(second, -60, GETUTCDATE())
        ORDER BY started_at DESC
      `);

      const hasRecentData = recentDataResult.recordset && recentDataResult.recordset.length > 0;
      const latestSession = recentDataResult.recordset?.[0];

      // Get registered campaigns count
      const campaignsResult = await req.query(`
        SELECT COUNT(*) as count FROM Campaigns
      `);

      const campaignCount = campaignsResult.recordset[0].count;

      return {
        snippetInstalled: hasRecentData,
        campaignsRegistered: campaignCount > 0,
        campaignCount: campaignCount,
        latestTest: latestSession ? {
          keyword: latestSession.keyword,
          timestamp: latestSession.started_at,
        } : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification status error:', error);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}