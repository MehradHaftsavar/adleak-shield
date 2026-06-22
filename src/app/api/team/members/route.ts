import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.user.isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = session.user.tenantId as string;

    const [members, invitations] = await Promise.all([
      withAdminDb(async (req) => {
        const r = await req
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`
            SELECT tm.member_id, tm.email, tm.role, tm.added_at, tm.accepted_at,
                   (SELECT STRING_AGG(d.domain_name, ', ')
                    FROM MemberDomainAccess mda
                    INNER JOIN Domains d ON d.domain_id = mda.domain_id
                    WHERE mda.member_id = tm.member_id) AS domains
            FROM   TeamMembers tm
            WHERE  tm.tenant_id = @tenantId
            ORDER  BY tm.added_at DESC
          `);
        return r.recordset;
      }),
      withAdminDb(async (req) => {
        const r = await req
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`
            SELECT invitation_id, email, role, created_at, expires_at, accepted_at
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
        addedAt:     m.added_at,
        acceptedAt:  m.accepted_at,
        domains:     m.domains ?? '',
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
