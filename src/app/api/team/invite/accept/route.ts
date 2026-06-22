import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'You must be logged in to accept an invitation' }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const userEmail = (session.user.email ?? '').toLowerCase();

    const result = await withAdminDb(async (req) => {
      req.input('tokenHash', mssql.NVarChar(64), tokenHash);
      req.input('email',     mssql.NVarChar(255), userEmail);

      // Look up the invitation
      const inv = await req.query(`
        SELECT invitation_id, tenant_id, invited_email, role, accepted_at, expires_at
        FROM   TeamInvitations
        WHERE  token_hash = @tokenHash
      `);

      const invitation = inv.recordset[0];
      if (!invitation) throw new Error('INVALID_TOKEN');
      if (invitation.accepted_at) throw new Error('ALREADY_ACCEPTED');
      if (new Date(invitation.expires_at) < new Date()) throw new Error('EXPIRED');

      // Verify this invitation belongs to the logged-in user's email
      if ((invitation.invited_email as string).toLowerCase() !== userEmail) {
        throw new Error('EMAIL_MISMATCH');
      }

      const now = new Date();
      req.input('invitedEmail', mssql.NVarChar(255),    invitation.invited_email);
      req.input('invTenantId',  mssql.UniqueIdentifier, invitation.tenant_id);
      req.input('invitationId', mssql.UniqueIdentifier, invitation.invitation_id);
      req.input('acceptedAt',   mssql.DateTime2,        now);

      // Accept both rows — look up TeamMember by email since invitation has no member_id
      await req.query(`
        UPDATE TeamMembers
        SET    accepted_at = @acceptedAt
        WHERE  tenant_id   = @invTenantId
          AND  email        = @invitedEmail
          AND  accepted_at IS NULL
      `);
      await req.query(`UPDATE TeamInvitations SET accepted_at = @acceptedAt WHERE invitation_id = @invitationId`);

      return { tenantId: invitation.tenant_id, role: invitation.role };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[team/invite/accept POST]', error);

    if (error instanceof Error) {
      if (error.message === 'INVALID_TOKEN')    return NextResponse.json({ error: 'This invitation link is invalid or has expired' }, { status: 404 });
      if (error.message === 'ALREADY_ACCEPTED') return NextResponse.json({ error: 'This invitation has already been accepted' }, { status: 409 });
      if (error.message === 'EXPIRED')          return NextResponse.json({ error: 'This invitation has expired. Ask the workspace owner to resend it.' }, { status: 410 });
      if (error.message === 'EMAIL_MISMATCH')   return NextResponse.json({ error: 'This invitation was sent to a different email address. Please sign in with the correct account.' }, { status: 403 });
    }

    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
}
