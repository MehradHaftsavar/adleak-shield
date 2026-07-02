import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb, withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;

    const [members, invitations] = await Promise.all([
      // Domains has RLS — must use withTenantDb so the STRING_AGG subquery can see domain names
      withTenantDb(tenantId, async (req) => {
        const r = await req.query(`
          SELECT tm.member_id, tm.email, tm.role, tm.created_at, tm.accepted_at,
                 (SELECT STRING_AGG(d.domain_name, ', ')
                  FROM MemberDomainAccess mda
                  INNER JOIN Domains d ON d.domain_id = mda.domain_id
                  WHERE mda.member_id = tm.member_id) AS domains,
                 (SELECT STRING_AGG(CAST(mda.domain_id AS NVARCHAR(36)), ',')
                  FROM MemberDomainAccess mda
                  WHERE mda.member_id = tm.member_id) AS domain_ids
          FROM   TeamMembers tm
          LEFT JOIN Tenants t ON t.email = tm.email
          WHERE  tm.tenant_id = CAST(SESSION_CONTEXT(N'TenantId') AS UNIQUEIDENTIFIER)
            AND  (t.deleted_at IS NULL OR t.tenant_id IS NULL)
          ORDER  BY tm.created_at DESC
        `);
        return r.recordset;
      }),
      withAdminDb(async (req) => {
        const r = await req
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`
            SELECT invitation_id, invited_email AS email, role,
                   created_at, expires_at, accepted_at
            FROM   TeamInvitations
            WHERE  tenant_id = @tenantId
              AND  accepted_at IS NULL
              AND  expires_at > GETUTCDATE()
            ORDER  BY created_at DESC
          `);
        return r.recordset;
      }),
    ]);

    return NextResponse.json({
      members:     members.map((m: any) => ({
        memberId:    m.member_id,
        email:       m.email,
        role:        m.role,
        addedAt:     m.created_at,
        acceptedAt:  m.accepted_at,
        domains:     m.domains ?? '',
        domainIds:   m.domain_ids ? m.domain_ids.split(',') : [],
        status:      m.accepted_at ? 'active' : 'pending',
      })),
      pendingInvitations: invitations.map((i: any) => ({
        invitationId: i.invitation_id,
        email:        i.email,
        role:         i.role,
        createdAt:    i.created_at,
        expiresAt:    i.expires_at,
      })),
    });
  } catch (error) {
    console.error('[team/members GET]', error);
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}
