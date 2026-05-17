import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb, withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Self-heal: flip any campaign that has real sessions but is still
      // marked awaiting_data — catches legacy data and any queue worker gaps
      await req.query(`
        UPDATE Campaigns
        SET status = 'active'
        WHERE status = 'awaiting_data'
          AND EXISTS (
            SELECT 1 FROM Sessions s WHERE s.campaign_id = Campaigns.campaign_id
          )
      `);

      // 1. Check if ANY data received in last 24 hours (Live status)
      const liveCheckResult = await req.query(`
        SELECT TOP 1 session_id
        FROM Sessions
        WHERE started_at >= DATEADD(hour, -24, GETUTCDATE())
      `);

      const isLive = liveCheckResult.recordset.length > 0;

      // 2. Get all campaigns with their status
      const campaignsResult = await req.query(`
        SELECT 
          c.campaign_id,
          c.google_campaign_id,
          c.slot_number,
          c.status,
          d.domain_name,
          (SELECT COUNT(*) FROM Sessions s WHERE s.campaign_id = c.campaign_id) as session_count,
          (SELECT TOP 1 started_at FROM Sessions s WHERE s.campaign_id = c.campaign_id ORDER BY started_at DESC) as last_session
        FROM Campaigns c
        INNER JOIN Domains d ON c.domain_id = d.domain_id
        ORDER BY c.slot_number
      `);

      const campaigns = campaignsResult.recordset.map(c => ({
        id: c.campaign_id,
        googleCampaignId: c.google_campaign_id,
        slotNumber: c.slot_number,
        domain: c.domain_name,
        status: c.status,
        sessionCount: c.session_count,
        lastSession: c.last_session,
      }));

      // 3. Check for unregistered traffic (last 7 days)
      const unregisteredResult = await req.query(`
        SELECT 
          unrecognised_campaign_id,
          COUNT(*) as hit_count,
          MAX(logged_at) as last_detected
        FROM UnregisteredTrafficLog
        WHERE logged_at >= DATEADD(day, -7, GETUTCDATE())
        GROUP BY unrecognised_campaign_id
        ORDER BY MAX(logged_at) DESC
      `);

      const unregisteredTraffic = unregisteredResult.recordset.map(u => ({
        googleCampaignId: u.unrecognised_campaign_id,
        hitCount: u.hit_count,
        lastDetected: u.last_detected,
      }));

      return {
        isLive,
        campaigns,
        unregisteredTraffic,
        hasUnregisteredTraffic: unregisteredTraffic.length > 0,
      };
    });

    const tenantId = session.user.tenantId as string;

    const tenantRow = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          SELECT subscription_status, trial_ends_at
          FROM Tenants
          WHERE tenant_id = @tenantId
        `);
      return r.recordset[0] ?? null;
    });

    const subscriptionStatus: string | null = tenantRow?.subscription_status ?? null;
    const trialEndsAt: Date | null = tenantRow?.trial_ends_at ?? null;

    const isActive = subscriptionStatus === 'active';
    const isTrialing = subscriptionStatus === 'trialing' && trialEndsAt !== null && new Date(trialEndsAt) > new Date();
    const isPaywalled = !isActive && !isTrialing;

    let daysLeftInTrial: number | null = null;
    if (trialEndsAt) {
      const ms = new Date(trialEndsAt).getTime() - Date.now();
      daysLeftInTrial = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    }

    return NextResponse.json({
      ...result,
      subscriptionStatus,
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
      isPaywalled,
      daysLeftInTrial,
    });
  } catch (error) {
    console.error('Dashboard status error:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}