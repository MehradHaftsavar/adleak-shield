import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.user.isOwner) {
      return NextResponse.json({ error: 'Only owners can edit member access' }, { status: 403 });
    }

    const tenantId  = session.user.tenantId as string;
    const { memberId } = params;
    const body      = await request.json();
    const { role, domainIds } = body as { role?: string; domainIds?: string[] };

    if (role && role !== 'editor' && role !== 'visitor') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await withAdminDb(async (req) => {
      req.input('memberId', mssql.UniqueIdentifier, memberId);
      req.input('tenantId', mssql.UniqueIdentifier, tenantId);

      const check = await req.query(`
        SELECT member_id FROM TeamMembers WHERE member_id = @memberId AND tenant_id = @tenantId
      `);
      if (check.recordset.length === 0) throw new Error('NOT_FOUND');

      if (role) {
        req.input('role', mssql.NVarChar(20), role);
        await req.query(`UPDATE TeamMembers SET role = @role WHERE member_id = @memberId AND tenant_id = @tenantId`);
      }

      if (domainIds !== undefined) {
        await req.query(`DELETE FROM MemberDomainAccess WHERE member_id = @memberId`);
        for (let i = 0; i < domainIds.length; i++) {
          req.input(`did${i}`, mssql.UniqueIdentifier, domainIds[i]);
          await req.query(`
            INSERT INTO MemberDomainAccess (member_id, domain_id)
            VALUES (@memberId, @did${i})
          `);
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[team/members/[memberId] PATCH]', error);
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;
    const { memberId } = params;

    if (!memberId) {
      return NextResponse.json({ error: 'Member ID required' }, { status: 400 });
    }

    await withAdminDb(async (req) => {
      req.input('memberId', mssql.UniqueIdentifier, memberId);
      req.input('tenantId', mssql.UniqueIdentifier, tenantId);

      // Verify the member belongs to this tenant and get their email
      const check = await req.query(`
        SELECT member_id, email FROM TeamMembers WHERE member_id = @memberId AND tenant_id = @tenantId
      `);
      if (check.recordset.length === 0) throw new Error('NOT_FOUND');

      const memberEmail = check.recordset[0].email as string;
      req.input('memberEmail', mssql.NVarChar(255), memberEmail);

      // Remove domain access first (FK constraint)
      await req.query(`DELETE FROM MemberDomainAccess WHERE member_id = @memberId`);

      // Remove any pending invitations by email (TeamInvitations has no member_id column)
      await req.query(`
        DELETE FROM TeamInvitations
        WHERE tenant_id = @tenantId AND invited_email = @memberEmail AND accepted_at IS NULL
      `);

      // Remove the member
      await req.query(`DELETE FROM TeamMembers WHERE member_id = @memberId AND tenant_id = @tenantId`);
    });

    return NextResponse.json({ success: true, message: 'Team member removed' });
  } catch (error) {
    console.error('[team/members/[memberId] DELETE]', error);
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}
