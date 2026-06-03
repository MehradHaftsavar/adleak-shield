import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withTenantDb, withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getEffectiveTenantId, blockedInImpersonation } from '@/lib/adminAuth';

// Validation schema for campaign registration
const campaignSchema = z.object({
  googleCampaignId: z.string()
    .regex(/^\d+$/, 'Campaign ID must be numeric')
    .min(1, 'Campaign ID is required')
    .max(20, 'Campaign ID too long'),
  avgCpc: z.number()
    .min(0.01, 'CPC must be at least £0.01')
    .max(1000, 'CPC must be less than £1000'),
});

// POST - Register a new campaign
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Block writes during admin impersonation
    const { isImpersonating } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();

    const body = await request.json();
    const { googleCampaignId, avgCpc } = body;

    // Validate avgCpc is provided
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

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Check domain registered (RLS auto-filters by tenant)
      const domainResult = await req.query(`SELECT domain_id FROM Domains`);
      const domain = domainResult.recordset?.[0];

      if (!domain) {
        throw new Error('DOMAIN_REQUIRED');
      }

      // Check campaign limit - Starter = 3 max
      const existingResult = await req.query(`
        SELECT campaign_id, google_campaign_id, slot_number, status
        FROM Campaigns
      `);

      const existingCampaigns = existingResult.recordset || [];

      if (existingCampaigns.length >= 3) {
        throw new Error('MAX_CAMPAIGNS');
      }

      // Check duplicate
      const duplicate = existingCampaigns.find(c => c.google_campaign_id === validatedData.googleCampaignId);
      if (duplicate) {
        throw new Error('DUPLICATE_CAMPAIGN');
      }

      // Determine slot number
      const usedSlots = existingCampaigns.map(c => c.slot_number);
      let slotNumber = 1;
      for (let i = 1; i <= 3; i++) {
        if (!usedSlots.includes(i)) {
          slotNumber = i;
          break;
        }
      }

      // Insert campaign with avg_cpc
      req.input('domainId', mssql.UniqueIdentifier, domain.domain_id);
      req.input('googleCampaignId', mssql.NVarChar, validatedData.googleCampaignId);
      req.input('slotNumber', mssql.Int, slotNumber);
      req.input('avgCpc', mssql.Decimal(10, 2), validatedData.avgCpc);
      
      await req.query(`
        INSERT INTO Campaigns (tenant_id, domain_id, google_campaign_id, slot_number, status, avg_cpc, created_at)
        VALUES (
          CAST(SESSION_CONTEXT(N'TenantId') AS uniqueidentifier), 
          @domainId, 
          @googleCampaignId, 
          @slotNumber, 
          'awaiting_data',
          @avgCpc,
          GETUTCDATE()
        )
      `);

      // Get the inserted campaign
      const selectResult = await req.query(`
        SELECT campaign_id, google_campaign_id, slot_number, domain_id, created_at, status, avg_cpc
        FROM Campaigns
        WHERE google_campaign_id = @googleCampaignId
      `);

      const newCampaign = selectResult.recordset[0];

      // Auto-cleanup: Delete old unregistered traffic logs for this campaign
      // This ensures the dashboard shows a clean state immediately after registration
      await req.query(`
        DELETE FROM UnregisteredTrafficLog
        WHERE unrecognised_campaign_id = @googleCampaignId
      `);

      return {
        success: true,
        campaign: {
          id: newCampaign.campaign_id,
          googleCampaignId: newCampaign.google_campaign_id,
          slotNumber: newCampaign.slot_number,
          domainId: newCampaign.domain_id,
          createdAt: newCampaign.created_at,
          status: newCampaign.status,
          avgCpc: newCampaign.avg_cpc,
        },
        message: 'Campaign registered successfully',
      };
    });

    // If this campaign was previously trialled by a deleted account, expire the
    // trial immediately — they already had their free trial on this campaign.
    const previouslyTrialled = await withAdminDb(async (req) => {
      const check = await req
        .input('val', mssql.NVarChar, validatedData.googleCampaignId)
        .query(`
          SELECT 1 FROM TrialledResources
          WHERE resource_type = 'campaign' AND resource_value = @val
        `);
      return check.recordset.length > 0;
    });

    if (previouslyTrialled) {
      await withAdminDb(async (req) => {
        await req
          .input('tenantId', mssql.UniqueIdentifier, session.user.tenantId)
          .query(`
            UPDATE Tenants
            SET trial_ends_at = GETUTCDATE()
            WHERE tenant_id = @tenantId
              AND subscription_status = 'trialing'
          `);
      });
      console.log(`[campaigns] Previously trialled campaign "${validatedData.googleCampaignId}" — trial expired for tenant ${session.user.tenantId}`);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Campaign registration error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'DOMAIN_REQUIRED') {
        return NextResponse.json({ error: 'Please register your domain first' }, { status: 400 });
      }
      if (error.message === 'MAX_CAMPAIGNS') {
        return NextResponse.json({ error: 'Maximum 3 campaigns allowed on Starter plan' }, { status: 400 });
      }
      if (error.message === 'DUPLICATE_CAMPAIGN') {
        return NextResponse.json({ error: 'This campaign ID is already registered' }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Failed to register campaign' }, { status: 500 });
  }
}

// GET - List all registered campaigns
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

    const result = await withTenantDb(tenantId, async (req) => {
      // Get all campaigns with avg_cpc (RLS auto-filters by tenant)
      const campaignsResult = await req.query(`
        SELECT campaign_id, google_campaign_id, slot_number, domain_id, created_at, status, avg_cpc
        FROM Campaigns
        ORDER BY slot_number
      `);

      return {
        campaigns: (campaignsResult.recordset || []).map(c => ({
          id: c.campaign_id,
          googleCampaignId: c.google_campaign_id,
          slotNumber: c.slot_number,
          domainId: c.domain_id,
          createdAt: c.createdAt,
          status: c.status,
          avgCpc: c.avg_cpc,
        })),
        count: campaignsResult.recordset?.length || 0,
        maxAllowed: 3,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Get campaigns error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

// PATCH - Update avg_cpc for an existing campaign
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isImpersonating } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();

    const body = await request.json();
    const { campaignId, avgCpc } = body;

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });
    }

    const parsedCpc = parseFloat(avgCpc);
    if (isNaN(parsedCpc) || parsedCpc < 0.01 || parsedCpc > 1000) {
      return NextResponse.json({ error: 'CPC must be between £0.01 and £1000' }, { status: 400 });
    }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      req.input('campaignId', mssql.UniqueIdentifier, campaignId);
      req.input('avgCpc', mssql.Decimal(10, 2), parsedCpc);

      const updateResult = await req.query(`
        UPDATE Campaigns
        SET avg_cpc = @avgCpc
        WHERE campaign_id = @campaignId
      `);

      if (updateResult.rowsAffected[0] === 0) {
        throw new Error('NOT_FOUND');
      }

      return { success: true, avgCpc: parsedCpc };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Update CPC error:', error);

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Campaign not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to update CPC' }, { status: 500 });
  }
}

// DELETE - Permanently remove a campaign and ALL related data
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isImpersonating } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();

    const { searchParams } = new URL(request.url);
    const campaignDbId = searchParams.get('id');

    if (!campaignDbId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });
    }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      req.input('campaignId', mssql.UniqueIdentifier, campaignDbId);
      
      // Manual cascade delete - delete related data first, then campaign
      // RLS ensures we only delete our own data
      
      // 1. Delete JourneyEvents
      await req.query(`DELETE FROM JourneyEvents WHERE session_id IN (SELECT session_id FROM Sessions WHERE campaign_id = @campaignId)`);
      
      // 2. Delete ClickLogs
      await req.query(`DELETE FROM ClickLogs WHERE campaign_id = @campaignId`);
      
      // 3. Delete Sessions
      await req.query(`DELETE FROM Sessions WHERE campaign_id = @campaignId`);
      
      // 4. Finally delete the Campaign
      const deleteResult = await req.query(`DELETE FROM Campaigns WHERE campaign_id = @campaignId`);

      if (deleteResult.rowsAffected[0] === 0) {
        throw new Error('NOT_FOUND');
      }

      return { 
        success: true, 
        message: 'Campaign and all related data permanently deleted',
      };
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