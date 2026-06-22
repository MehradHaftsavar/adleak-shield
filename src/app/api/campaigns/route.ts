import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withTenantDb, withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getEffectiveTenantId, blockedInImpersonation, forbidden } from '@/lib/adminAuth';
import { PLAN_LIMITS } from '@/lib/planLimits';
import type { PlanType } from '@/types/auth';

const campaignSchema = z.object({
  googleCampaignId: z.string()
    .regex(/^\d+$/, 'Campaign ID must be numeric')
    .min(1, 'Campaign ID is required')
    .max(20, 'Campaign ID too long'),
  avgCpc: z.number()
    .min(0.01, 'CPC must be at least £0.01')
    .max(1000, 'CPC must be less than £1000'),
  name: z.string().max(100).optional(),
});

async function getActivePlanType(
  effectiveTenantId: string,
  sessionTenantId: string,
  sessionPlanType: string | undefined
): Promise<PlanType> {
  if (effectiveTenantId === sessionTenantId) {
    return (sessionPlanType ?? 'starter') as PlanType;
  }
  // Editor/visitor acting on a different tenant — fetch that tenant's plan
  try {
    const row = await withAdminDb(async (req) => {
      const r = await req
        .input('tid', mssql.UniqueIdentifier, effectiveTenantId)
        .query(`SELECT ISNULL(plan_type, 'starter') AS plan_type FROM Tenants WHERE tenant_id = @tid`);
      return r.recordset[0] ?? null;
    });
    return (row?.plan_type ?? 'starter') as PlanType;
  } catch {
    return 'starter';
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId, isImpersonating, role } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();
    if (role === 'visitor') return forbidden('Visitors cannot register campaigns');

    const body = await request.json();
    const { googleCampaignId, avgCpc } = body;

    if (!avgCpc || isNaN(parseFloat(avgCpc))) {
      return NextResponse.json({ error: 'Average CPC is required' }, { status: 400 });
    }

    const validation = campaignSchema.safeParse({
      googleCampaignId,
      avgCpc: parseFloat(avgCpc),
    });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }
    const validatedData = validation.data;

    const planType  = await getActivePlanType(tenantId, session.user.tenantId as string, session.user.planType);
    const maxAllowed = PLAN_LIMITS[planType].campaignsPerDomain;

    const { domainId: bodyDomainId } = body;

    const result = await withTenantDb(tenantId, async (req) => {
      // Resolve target domain — use provided domainId or fall back to first domain
      let domainId: string;
      if (bodyDomainId) {
        req.input('reqDomainId', mssql.UniqueIdentifier, bodyDomainId);
        const check = await req.query(`SELECT domain_id FROM Domains WHERE domain_id = @reqDomainId`);
        if (check.recordset.length === 0) throw new Error('DOMAIN_REQUIRED');
        domainId = bodyDomainId;
      } else {
        const domainResult = await req.query(`SELECT domain_id FROM Domains`);
        const firstDomain = domainResult.recordset?.[0];
        if (!firstDomain) throw new Error('DOMAIN_REQUIRED');
        domainId = firstDomain.domain_id;
      }

      // Enforce per-domain campaign limit
      req.input('domainId', mssql.UniqueIdentifier, domainId);
      const existingResult = await req.query(`
        SELECT campaign_id, google_campaign_id, slot_number, status FROM Campaigns WHERE domain_id = @domainId
      `);
      const existingCampaigns = existingResult.recordset ?? [];

      if (existingCampaigns.length >= maxAllowed) throw new Error('MAX_CAMPAIGNS');

      // Also check for duplicate across all domains for this tenant
      req.input('googleCampaignId', mssql.NVarChar, validatedData.googleCampaignId);
      const dupCheck = await req.query(`
        SELECT 1 FROM Campaigns WHERE google_campaign_id = @googleCampaignId
      `);
      if (dupCheck.recordset.length > 0) throw new Error('DUPLICATE_CAMPAIGN');

      // Find the lowest unused slot number for this domain
      const usedSlots = existingCampaigns.map((c: any) => c.slot_number);
      let slotNumber = 1;
      for (let i = 1; i <= maxAllowed; i++) {
        if (!usedSlots.includes(i)) { slotNumber = i; break; }
      }

      req.input('slotNumber',    mssql.Int,            slotNumber);
      req.input('avgCpc',        mssql.Decimal(10, 2), validatedData.avgCpc);
      req.input('campaignName',  mssql.NVarChar(100),  validatedData.name ?? null);

      await req.query(`
        INSERT INTO Campaigns (tenant_id, domain_id, google_campaign_id, slot_number, status, avg_cpc, name, created_at)
        VALUES (CAST(SESSION_CONTEXT(N'TenantId') AS uniqueidentifier), @domainId, @googleCampaignId, @slotNumber, 'awaiting_data', @avgCpc, @campaignName, GETUTCDATE())
      `);

      const selectResult = await req.query(`
        SELECT campaign_id, google_campaign_id, slot_number, domain_id, created_at, status, avg_cpc, name
        FROM   Campaigns WHERE google_campaign_id = @googleCampaignId
      `);
      const newCampaign = selectResult.recordset[0];

      await req.query(`DELETE FROM UnregisteredTrafficLog WHERE unrecognised_campaign_id = @googleCampaignId`);

      return {
        success: true,
        campaign: {
          id:               newCampaign.campaign_id,
          googleCampaignId: newCampaign.google_campaign_id,
          slotNumber:       newCampaign.slot_number,
          name:             newCampaign.name ?? null,
          domainId:         newCampaign.domain_id,
          createdAt:        newCampaign.created_at,
          status:           newCampaign.status,
          avgCpc:           newCampaign.avg_cpc,
        },
        message: 'Campaign registered successfully',
      };
    });

    // Expire trial if campaign was previously trialled by a deleted account
    const previouslyTrialled = await withAdminDb(async (req) => {
      const check = await req
        .input('val', mssql.NVarChar, validatedData.googleCampaignId)
        .query(`SELECT 1 FROM TrialledResources WHERE resource_type = 'campaign' AND resource_value = @val`);
      return check.recordset.length > 0;
    });

    if (previouslyTrialled) {
      await withAdminDb(async (req) => {
        await req
          .input('tenantId', mssql.UniqueIdentifier, session.user.tenantId)
          .query(`UPDATE Tenants SET trial_ends_at = GETUTCDATE() WHERE tenant_id = @tenantId AND subscription_status = 'trialing'`);
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Campaign registration error:', error);

    if (error instanceof Error) {
      if (error.message === 'DOMAIN_REQUIRED')    return NextResponse.json({ error: 'Please register your domain first' }, { status: 400 });
      if (error.message === 'MAX_CAMPAIGNS')       return NextResponse.json({ error: 'Campaign limit reached for your plan' }, { status: 400 });
      if (error.message === 'DUPLICATE_CAMPAIGN')  return NextResponse.json({ error: 'This campaign ID is already registered' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to register campaign' }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    const planType   = await getActivePlanType(tenantId, session.user.tenantId as string, session.user.planType);
    const maxAllowed = PLAN_LIMITS[planType].campaignsPerDomain;

    const result = await withTenantDb(tenantId, async (req) => {
      const campaignsResult = await req.query(`
        SELECT c.campaign_id, c.google_campaign_id, c.slot_number, c.domain_id,
               d.domain_name, c.created_at, c.status, c.avg_cpc, c.name
        FROM   Campaigns c
        INNER JOIN Domains d ON d.domain_id = c.domain_id
        ORDER BY d.domain_name, c.slot_number
      `);
      return {
        campaigns: (campaignsResult.recordset ?? []).map((c: any) => ({
          id:               c.campaign_id,
          googleCampaignId: c.google_campaign_id,
          slotNumber:       c.slot_number,
          name:             c.name ?? null,
          domainId:         c.domain_id,
          domainName:       c.domain_name,
          createdAt:        c.created_at,
          status:           c.status,
          avgCpc:           c.avg_cpc,
        })),
        count:      campaignsResult.recordset?.length ?? 0,
        maxAllowed,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Get campaigns error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId, isImpersonating, role } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();
    if (role === 'visitor') return forbidden('Visitors cannot update campaigns');

    const body = await request.json();
    const { campaignId, avgCpc, name } = body;

    if (!campaignId) return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });

    const result = await withTenantDb(tenantId, async (req) => {
      req.input('campaignId', mssql.UniqueIdentifier, campaignId);

      const sets: string[] = [];
      if (avgCpc !== undefined) {
        const parsedCpc = parseFloat(avgCpc);
        if (isNaN(parsedCpc) || parsedCpc < 0.01 || parsedCpc > 1000) {
          throw new Error('INVALID_CPC');
        }
        req.input('avgCpc', mssql.Decimal(10, 2), parsedCpc);
        sets.push('avg_cpc = @avgCpc');
      }
      if (name !== undefined) {
        req.input('name', mssql.NVarChar(100), name || null);
        sets.push('name = @name');
      }
      if (sets.length === 0) throw new Error('NO_FIELDS');

      const updateResult = await req.query(`UPDATE Campaigns SET ${sets.join(', ')} WHERE campaign_id = @campaignId`);
      if (updateResult.rowsAffected[0] === 0) throw new Error('NOT_FOUND');
      return { success: true, avgCpc: avgCpc !== undefined ? parseFloat(avgCpc) : undefined, name: name ?? undefined };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Update campaign error:', error);
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND')   return NextResponse.json({ error: 'Campaign not found or unauthorized' }, { status: 404 });
      if (error.message === 'INVALID_CPC') return NextResponse.json({ error: 'CPC must be between £0.01 and £1000' }, { status: 400 });
      if (error.message === 'NO_FIELDS')   return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId, isImpersonating, role } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();
    if (role === 'visitor') return forbidden('Visitors cannot delete campaigns');

    const { searchParams } = new URL(request.url);
    const campaignDbId = searchParams.get('id');
    if (!campaignDbId) return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });

    const result = await withTenantDb(tenantId, async (req) => {
      req.input('campaignId', mssql.UniqueIdentifier, campaignDbId);
      await req.query(`DELETE FROM JourneyEvents WHERE session_id IN (SELECT session_id FROM Sessions WHERE campaign_id = @campaignId)`);
      await req.query(`DELETE FROM ClickLogs WHERE campaign_id = @campaignId`);
      await req.query(`DELETE FROM Sessions  WHERE campaign_id = @campaignId`);
      const deleteResult = await req.query(`DELETE FROM Campaigns WHERE campaign_id = @campaignId`);
      if (deleteResult.rowsAffected[0] === 0) throw new Error('NOT_FOUND');
      return { success: true, message: 'Campaign and all related data permanently deleted' };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Delete campaign error:', error);
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Campaign not found or unauthorized' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
