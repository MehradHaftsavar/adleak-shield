import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withAdminDb, withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getEffectiveTenantId, blockedInImpersonation } from '@/lib/adminAuth';

// Validation schema for domain input
const domainSchema = z.object({
  domain: z.string()
    .min(3, 'Domain must be at least 3 characters')
    .max(253, 'Domain must be less than 253 characters')
    .regex(
      /^(localhost:\d+|([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,})$/i,
      'Invalid domain format (e.g., example.co.uk or localhost:8000)'
    )
    .transform(val => val.toLowerCase().trim()),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user with NextAuth v5
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Block writes during admin impersonation
    const { isImpersonating } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();

    // 2. Parse and validate input
    const body = await request.json();
    const validation = domainSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { domain } = validation.data;

    // 3. Check if this domain is already claimed by a different tenant
    const claimedByOther = await withAdminDb(async (req) => {
      const result = await req
        .input('domainName', mssql.NVarChar, domain)
        .query(`SELECT tenant_id FROM Domains WHERE domain_name = @domainName`);
      const row = result.recordset[0];
      return row && row.tenant_id !== session.user.tenantId ? true : false;
    });

    if (claimedByOther) {
      return NextResponse.json(
        { error: 'This domain has already been registered by another account.' },
        { status: 409 }
      );
    }

    // 4. Check if this domain was previously trialled by a deleted account
    //    If so, allow registration but expire any active trial immediately —
    //    the person already had their free trial.
    const previouslyTrialled = await withAdminDb(async (req) => {
      const result = await req
        .input('domainName', mssql.NVarChar, domain)
        .query(`
          SELECT 1 FROM TrialledResources
          WHERE resource_type = 'domain' AND resource_value = @domainName
        `);
      return result.recordset.length > 0;
    });

    // 5. Use withTenantDb to set RLS context
    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Check if tenant already has a domain
      const existingDomainResult = await req.query(`
        SELECT domain_id, domain_name 
        FROM Domains 
      `);

      const existingDomain = existingDomainResult.recordset?.[0];

      if (existingDomain && existingDomain.domain_name !== domain) {
        throw new Error('ONE_DOMAIN_ONLY');
      }

      // If domain already exists with same name, return it
      if (existingDomain && existingDomain.domain_name === domain) {
        return {
          success: true,
          domain: existingDomain.domain_name,
          domainId: existingDomain.domain_id,
          message: 'Domain already registered',
        };
      }

      // Insert new domain
      req.input('domainName', mssql.NVarChar, domain);
      await req.query(`
  INSERT INTO Domains (tenant_id, domain_name, verified)
  VALUES (CAST(SESSION_CONTEXT(N'TenantId') AS uniqueidentifier), @domainName, 0)
`);

      // Get the inserted domain
      const selectResult = await req.query(`
        SELECT domain_id, domain_name
        FROM Domains
        WHERE domain_name = @domainName
      `);

      const newDomain = selectResult.recordset[0];

      return {
        success: true,
        domain: newDomain.domain_name,
        domainId: newDomain.domain_id,
        message: 'Domain registered successfully',
      };
    });

    // If this domain was previously trialled, expire the trial immediately so
    // the user is paywalled — they already had their free trial on this domain.
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
      console.log(`[domain] Previously trialled domain "${domain}" — trial expired for tenant ${session.user.tenantId}`);
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Domain registration error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'ONE_DOMAIN_ONLY') {
        return NextResponse.json(
          { error: 'You can only register 1 domain on Starter plan' },
          { status: 400 }
        );
      }
      // SQL unique constraint violation (race condition safety net)
      if ('number' in error && (error as any).number === 2627) {
        return NextResponse.json(
          { error: 'This domain has already been registered by another account.' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to register domain' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current user's domain
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { tenantId } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    const result = await withTenantDb(tenantId, async (req) => {
      // Get domain for this tenant
      const domainResult = await req.query(`
        SELECT domain_id, domain_name, verified
        FROM Domains
      `);

      const domain = domainResult.recordset?.[0];

      return {
        domain: domain?.domain_name || null,
        domainId: domain?.domain_id || null,
        verified: domain?.verified || false,
      };
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Get domain error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch domain' },
      { status: 500 }
    );
  }
}

// DELETE - Remove domain and cascade delete all campaigns + unregistered traffic logs
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CRITICAL: block during impersonation — this deletes ALL tenant data
    const { isImpersonating } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Get campaign IDs and their google_campaign_ids before deletion
      const campaignsResult = await req.query(`
        SELECT campaign_id, google_campaign_id FROM Campaigns
      `);

      const campaigns = campaignsResult.recordset;
      const campaignIds = campaigns.map(c => c.campaign_id);
      const googleCampaignIds = campaigns.map(c => c.google_campaign_id);

      // Manual cascade delete for each campaign's related data
      for (let i = 0; i < campaignIds.length; i++) {
        const campaignId = campaignIds[i];
        const paramName = `cid${i}`;
        
        req.input(paramName, mssql.UniqueIdentifier, campaignId);
        
        // 1. Delete JourneyEvents
        await req.query(`DELETE FROM JourneyEvents WHERE session_id IN (SELECT session_id FROM Sessions WHERE campaign_id = @${paramName})`);
        
        // 2. Delete ClickLogs
        await req.query(`DELETE FROM ClickLogs WHERE campaign_id = @${paramName}`);
        
        // 3. Delete Sessions
        await req.query(`DELETE FROM Sessions WHERE campaign_id = @${paramName}`);
        
        // 4. Delete Campaign
        await req.query(`DELETE FROM Campaigns WHERE campaign_id = @${paramName}`);
      }

      // 5. Delete UnregisteredTrafficLog entries for these google_campaign_ids
      for (let i = 0; i < googleCampaignIds.length; i++) {
        const googleCampaignId = googleCampaignIds[i];
        const paramName = `gcid${i}`;
        
        req.input(paramName, mssql.NVarChar, googleCampaignId);
        
        await req.query(`
          DELETE FROM UnregisteredTrafficLog 
          WHERE unrecognised_campaign_id = @${paramName}
        `);
      }

      // 6. Finally delete the domain
      const deleteResult = await req.query(`DELETE FROM Domains`);

      if (deleteResult.rowsAffected[0] === 0) {
        throw new Error('NOT_FOUND');
      }

      return { 
        success: true, 
        message: 'Domain, campaigns, and unregistered traffic logs deleted successfully',
        deletedCampaigns: campaignIds.length,
        cleanedUnregisteredLogs: googleCampaignIds.length,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Delete domain error:', error);
    
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to delete domain' }, { status: 500 });
  }
}