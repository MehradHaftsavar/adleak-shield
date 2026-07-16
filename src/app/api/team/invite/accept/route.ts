import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

// Accepting an invitation requires only the token — it was mailed to the invited
// address, so possessing it proves control of that inbox (same trust model as a
// password-reset link). No login is required, so a brand-new invitee can accept
// straight from the email before they've created an account. Once they later sign
// up (or sign in) with the invited email, loadAccessibleDomains matches them by
// email and the accepted membership appears.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await withAdminDb(async (req) => {
      req.input('tokenHash', mssql.NVarChar(64), tokenHash);

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

      const now = new Date();
      req.input('invitedEmail', mssql.NVarChar(255),    invitation.invited_email);
      req.input('invTenantId',  mssql.UniqueIdentifier, invitation.tenant_id);
      req.input('invitationId', mssql.UniqueIdentifier, invitation.invitation_id);
      req.input('acceptedAt',   mssql.DateTime2,        now);

      // Stamp accepted_at on the member row (looked up by tenant + invited email,
      // since TeamInvitations has no member_id) and on the invitation itself.
      await req.query(`
        UPDATE TeamMembers
        SET    accepted_at = @acceptedAt
        WHERE  tenant_id   = @invTenantId
          AND  email        = @invitedEmail
          AND  accepted_at IS NULL
      `);
      await req.query(`UPDATE TeamInvitations SET accepted_at = @acceptedAt WHERE invitation_id = @invitationId`);

      return {
        tenantId:     invitation.tenant_id,
        role:         invitation.role,
        invitedEmail: invitation.invited_email as string,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[team/invite/accept POST]', error);

    if (error instanceof Error) {
      if (error.message === 'INVALID_TOKEN')    return NextResponse.json({ error: 'This invitation link is invalid or has expired' }, { status: 404 });
      if (error.message === 'ALREADY_ACCEPTED') return NextResponse.json({ error: 'This invitation has already been accepted' }, { status: 409 });
      if (error.message === 'EXPIRED')          return NextResponse.json({ error: 'This invitation has expired. Ask the workspace owner to resend it.' }, { status: 410 });
    }

    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
}
