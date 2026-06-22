import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

// DELETE — cancel a pending invitation (owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { invitationId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;
    const { invitationId } = params;

    await withAdminDb(async (req) => {
      req.input('invitationId', mssql.UniqueIdentifier, invitationId);
      req.input('tenantId',     mssql.UniqueIdentifier, tenantId);

      // Verify ownership and get the invited email so we can look up the member row
      const inv = await req.query(`
        SELECT invited_email FROM TeamInvitations
        WHERE invitation_id = @invitationId AND tenant_id = @tenantId AND accepted_at IS NULL
      `);
      if (inv.recordset.length === 0) throw new Error('NOT_FOUND');

      const invitedEmail = inv.recordset[0].invited_email as string;

      // Look up the pending TeamMember row by email
      req.input('invitedEmail', mssql.NVarChar(255), invitedEmail);
      const memberRow = await req.query(`
        SELECT member_id FROM TeamMembers
        WHERE tenant_id = @tenantId AND email = @invitedEmail AND accepted_at IS NULL
      `);
      const memberId = memberRow.recordset[0]?.member_id as string | undefined;

      // Delete domain access, invitation, and the pending member row
      if (memberId) {
        req.input('memberId', mssql.UniqueIdentifier, memberId);
        await req.query(`DELETE FROM MemberDomainAccess WHERE member_id = @memberId`);
        await req.query(`DELETE FROM TeamMembers WHERE member_id = @memberId AND tenant_id = @tenantId AND accepted_at IS NULL`);
      }
      await req.query(`DELETE FROM TeamInvitations WHERE invitation_id = @invitationId AND tenant_id = @tenantId`);
    });

    return NextResponse.json({ success: true, message: 'Invitation cancelled' });
  } catch (error) {
    console.error('[team/invite/[invitationId] DELETE]', error);
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Invitation not found or already accepted' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 });
  }
}
