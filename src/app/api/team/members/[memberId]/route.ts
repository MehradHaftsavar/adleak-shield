import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

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

      // Verify the member belongs to this tenant before deleting
      const check = await req.query(`
        SELECT member_id FROM TeamMembers WHERE member_id = @memberId AND tenant_id = @tenantId
      `);
      if (check.recordset.length === 0) throw new Error('NOT_FOUND');

      // Remove domain access first (FK constraint)
      await req.query(`DELETE FROM MemberDomainAccess WHERE member_id = @memberId`);

      // Remove any pending invitations for this member
      await req.query(`DELETE FROM TeamInvitations WHERE member_id = @memberId`);

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
