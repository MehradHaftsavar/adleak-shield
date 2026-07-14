import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb, withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getEffectiveTenantId, buildDomainFilter } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve effective tenant (supports admin impersonation)
    const { tenantId: effectiveTenantId, activeDomainId, memberDomainIds } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    const result = await withTenantDb(effectiveTenantId, async (req) => {
      const domainFilter = buildDomainFilter(activeDomainId, memberDomainIds, 'c.domain_id');
      const domainFilterNaked = buildDomainFilter(activeDomainId, memberDomainIds, 'domain_id');

      // Self-heal: flip any campaign that has real sessions but is still
      // marked awaiting_data — catches legacy data and any queue worker gaps
      await req.query(`
        UPDATE Campaigns
        SET status = 'active'
        WHERE status = 'awaiting_data'
          ${domainFilterNaked}
          AND EXISTS (
            SELECT 1 FROM Sessions s
            WHERE s.campaign_id = Campaigns.campaign_id
              AND s.keyword <> 'adleak_test'
          )
      `);

      // 1. Check if ANY real data received in last 24 hours (Live status)
      const liveCheckResult = await req.query(`
        SELECT TOP 1 s.session_id
        FROM Sessions s
        INNER JOIN Campaigns c ON c.campaign_id = s.campaign_id
        WHERE s.started_at >= DATEADD(hour, -24, GETUTCDATE())
          AND s.keyword <> 'adleak_test'
          ${domainFilter}
      `);

      const isLive = liveCheckResult.recordset.length > 0;

      // 2. Get campaigns with their status (filtered by active domain)
      const campaignsResult = await req.query(`
        SELECT
          c.campaign_id,
          c.domain_id,
          c.google_campaign_id,
          c.slot_number,
          c.name,
          c.status,
          d.domain_name,
          (SELECT COUNT(*) FROM Sessions s WHERE s.campaign_id = c.campaign_id AND s.keyword <> 'adleak_test') as session_count,
          (SELECT TOP 1 started_at FROM Sessions s WHERE s.campaign_id = c.campaign_id AND s.keyword <> 'adleak_test' ORDER BY started_at DESC) as last_session
        FROM Campaigns c
        INNER JOIN Domains d ON c.domain_id = d.domain_id
        WHERE 1=1 ${domainFilter}
        ORDER BY d.domain_name, c.slot_number
      `);

      const campaigns = campaignsResult.recordset.map(c => ({
        id: c.campaign_id,
        domainId: c.domain_id,
        googleCampaignId: c.google_campaign_id,
        slotNumber: c.slot_number,
        name: c.name ?? null,
        domain: c.domain_name,
        status: c.status,
        sessionCount: c.session_count,
        lastSession: c.last_session,
      }));

      // 3. Check for unregistered traffic (last 7 days), grouped per campaign+domain
      const unregisteredResult = await req.query(`
        SELECT
          u.unrecognised_campaign_id,
          u.domain_id,
          d.domain_name,
          COUNT(*) AS hit_count,
          MAX(u.logged_at) AS last_detected
        FROM UnregisteredTrafficLog u
        LEFT JOIN Domains d ON d.domain_id = u.domain_id
        WHERE u.logged_at >= DATEADD(day, -7, GETUTCDATE())
        GROUP BY u.unrecognised_campaign_id, u.domain_id, d.domain_name
        ORDER BY MAX(u.logged_at) DESC
      `);

      const registeredGoogleIds = new Set(campaigns.map(c => c.googleCampaignId));

      const unregisteredTraffic = unregisteredResult.recordset.map(u => ({
        googleCampaignId: u.unrecognised_campaign_id,
        domainId:         u.domain_id ?? null,
        domainName:       u.domain_name ?? null,
        hitCount:         u.hit_count,
        lastDetected:     u.last_detected,
        isMismatch:       registeredGoogleIds.has(u.unrecognised_campaign_id),
      }));

      return {
        isLive,
        campaigns,
        unregisteredTraffic,
        hasUnregisteredTraffic: unregisteredTraffic.length > 0,
      };
    });

    const tenantRow = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, effectiveTenantId)
        .query(`
          SELECT subscription_status, trial_ends_at,
                 ISNULL(plan_type, 'starter') AS plan_type
          FROM Tenants
          WHERE tenant_id = @tenantId
        `);
      return r.recordset[0] ?? null;
    });

    const subscriptionStatus: string | null = tenantRow?.subscription_status ?? null;
    const trialEndsAt: Date | null = tenantRow?.trial_ends_at ?? null;
    const planType: string = tenantRow?.plan_type ?? 'starter';

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
      planType,
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
      isPaywalled,
      daysLeftInTrial,
    });
  } catch (error) {
    console.error('Dashboard status error:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}