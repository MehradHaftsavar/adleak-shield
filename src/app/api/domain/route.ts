import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withAdminDb, withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getEffectiveTenantId, blockedInImpersonation, forbidden } from '@/lib/adminAuth';
import { PLAN_LIMITS } from '@/lib/planLimits';
import type { PlanType } from '@/types/auth';

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
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isImpersonating, role } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();
    // Only owners can add domains — editors/visitors work on the owner's behalf
    if (role === 'visitor') return forbidden('Visitors cannot register domains');
    if (role === 'editor')  return forbidden('Editors cannot register domains');

    const body = await request.json();
    const validation = domainSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }
    const { domain } = validation.data;

    // Check claimed by another active tenant
    const claimedByOther = await withAdminDb(async (req) => {
      const result = await req
        .input('domainName', mssql.NVarChar, domain)
        .query(`
          SELECT d.tenant_id
          FROM   Domains d
          INNER JOIN Tenants t ON t.tenant_id = d.tenant_id
          WHERE  d.domain_name = @domainName AND t.deleted_at IS NULL
        `);
      const row = result.recordset[0];
      return row && row.tenant_id !== session.user.tenantId ? true : false;
    });

    if (claimedByOther) {
      return NextResponse.json(
        { error: 'This domain has already been registered by another account.' },
        { status: 409 }
      );
    }

    // Check if previously trialled by a deleted account
    const previouslyTrialled = await withAdminDb(async (req) => {
      const result = await req
        .input('domainName', mssql.NVarChar, domain)
        .query(`SELECT 1 FROM TrialledResources WHERE resource_type = 'domain' AND resource_value = @domainName`);
      return result.recordset.length > 0;
    });

    const planType = (session.user.planType ?? 'starter') as PlanType;
    const maxDomains = PLAN_LIMITS[planType].domains;

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      const existingResult = await req.query(`SELECT domain_id, domain_name FROM Domains`);
      const existingDomains = existingResult.recordset ?? [];

      // Same-domain idempotency
      const existing = existingDomains.find((d: any) => d.domain_name === domain);
      if (existing) {
        return { success: true, domain: existing.domain_name, domainId: existing.domain_id, message: 'Domain already registered' };
      }

      // Plan limit check
      if (existingDomains.length >= maxDomains) {
        throw new Error('DOMAIN_LIMIT');
      }

      req.input('domainName', mssql.NVarChar, domain);
      await req.query(`
        INSERT INTO Domains (tenant_id, domain_name, verified)
        VALUES (CAST(SESSION_CONTEXT(N'TenantId') AS uniqueidentifier), @domainName, 0)
      `);

      const selectResult = await req.query(`SELECT domain_id, domain_name FROM Domains WHERE domain_name = @domainName`);
      const newDomain = selectResult.recordset[0];

      return { success: true, domain: newDomain.domain_name, domainId: newDomain.domain_id, message: 'Domain registered successfully' };
    });

    if (previouslyTrialled) {
      await withAdminDb(async (req) => {
        await req
          .input('tenantId', mssql.UniqueIdentifier, session.user.tenantId)
          .query(`
            UPDATE Tenants
            SET trial_ends_at = GETUTCDATE()
            WHERE tenant_id = @tenantId AND subscription_status = 'trialing'
          `);
      });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Domain registration error:', error);

    if (error instanceof Error) {
      if (error.message === 'DOMAIN_LIMIT') {
        const planType = 'starter'; // fallback label
        return NextResponse.json(
          { error: `Domain limit reached for your plan` },
          { status: 400 }
        );
      }
      // Legacy: kept for backward-compat in case old sessions call it
      if (error.message === 'ONE_DOMAIN_ONLY') {
        return NextResponse.json(
          { error: 'You can only register 1 domain on Starter plan' },
          { status: 400 }
        );
      }
      if ('number' in error && (error as any).number === 2627) {
        return NextResponse.json(
          { error: 'This domain has already been registered by another account.' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({ error: 'Failed to register domain' }, { status: 500 });
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

    const result = await withTenantDb(tenantId, async (req) => {
      const domainResult = await req.query(`SELECT domain_id, domain_name, verified FROM Domains`);
      const rows   = domainResult.recordset ?? [];
      const domain = rows[0];
      return {
        domain:   domain?.domain_name || null,
        domainId: domain?.domain_id   || null,
        verified: domain?.verified    || false,
        count:    rows.length,
        domains:  rows.map((d: any) => ({ domainId: d.domain_id, domainName: d.domain_name, verified: d.verified })),
      };
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Get domain error:', error);
    return NextResponse.json({ error: 'Failed to fetch domain' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isImpersonating, role } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );
    if (isImpersonating) return blockedInImpersonation();
    if (role === 'visitor') return forbidden('Visitors cannot delete domains');
    if (role === 'editor')  return forbidden('Editors cannot delete domains');

    // Optional domainId to delete a specific domain; if omitted, deletes all (legacy)
    let targetDomainId: string | null = null;
    try {
      const body = await request.json();
      if (body?.domainId) targetDomainId = body.domainId as string;
    } catch { /* no body — legacy delete-all */ }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Resolve which domain(s) to delete
      let domainIds: string[];
      if (targetDomainId) {
        req.input('targetDomainId', mssql.UniqueIdentifier, targetDomainId);
        const check = await req.query(`SELECT domain_id FROM Domains WHERE domain_id = @targetDomainId`);
        if (check.recordset.length === 0) throw new Error('NOT_FOUND');
        domainIds = [targetDomainId];
      } else {
        const domainResult = await req.query(`SELECT domain_id FROM Domains`);
        domainIds = (domainResult.recordset ?? []).map((d: any) => d.domain_id);
      }

      // Delete campaigns and their data for the targeted domain(s)
      for (let i = 0; i < domainIds.length; i++) {
        const domainId  = domainIds[i];
        const dParam    = `delDomain${i}`;
        req.input(dParam, mssql.UniqueIdentifier, domainId);
        const campaignsResult = await req.query(`SELECT campaign_id FROM Campaigns WHERE domain_id = @${dParam}`);
        const campaignIds = (campaignsResult.recordset ?? []).map((c: any) => c.campaign_id);

        for (let j = 0; j < campaignIds.length; j++) {
          const campaignId = campaignIds[j];
          const cParam     = `cid${i}_${j}`;
          req.input(cParam, mssql.UniqueIdentifier, campaignId);
          await req.query(`DELETE FROM JourneyEvents WHERE session_id IN (SELECT session_id FROM Sessions WHERE campaign_id = @${cParam})`);
          await req.query(`DELETE FROM ClickLogs   WHERE campaign_id = @${cParam}`);
          await req.query(`DELETE FROM Sessions    WHERE campaign_id = @${cParam}`);
          await req.query(`DELETE FROM Campaigns   WHERE campaign_id = @${cParam}`);
        }

        // Clean up MemberDomainAccess rows (FK constraint)
        await req.query(`DELETE FROM MemberDomainAccess WHERE domain_id = @${dParam}`);

        const deleteResult = await req.query(`DELETE FROM Domains WHERE domain_id = @${dParam}`);
        if (deleteResult.rowsAffected[0] === 0) throw new Error('NOT_FOUND');
      }

      // Only wipe UnregisteredTrafficLog when deleting all domains
      if (!targetDomainId) {
        await req.query(`DELETE FROM UnregisteredTrafficLog`);
      }

      return {
        success: true,
        message: 'Domain, campaigns, and all related data deleted successfully',
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
