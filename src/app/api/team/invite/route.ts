import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { withAdminDb, getAdminPool } from '@/lib/db/client';
import * as mssql from 'mssql';
import { Resend } from 'resend';
import { buildTeamInvitationEmail } from '@/lib/email/teamInvitation';
import { PLAN_LIMITS } from '@/lib/planLimits';
import type { PlanType } from '@/types/auth';

const resend = new Resend(process.env.RESEND_API_KEY);

const inviteSchema = z.object({
  email:     z.string().email('Invalid email address').toLowerCase(),
  role:      z.enum(['editor', 'visitor']),
  domainIds: z.array(z.string().uuid()).optional(), // if omitted, grant all domains
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only the account owner can invite team members
    if (!session.user.isOwner) {
      return NextResponse.json({ error: 'Only account owners can invite team members' }, { status: 403 });
    }

    const body = await request.json();
    const validation = inviteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
    }
    const { email, role, domainIds } = validation.data;

    const tenantId = session.user.tenantId as string;
    const planType = (session.user.planType ?? 'starter') as PlanType;
    const maxSeats = PLAN_LIMITS[planType].seats;

    // Can't invite yourself
    if (email === (session.user.email ?? '').toLowerCase()) {
      return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 });
    }

    // Check existing seat count (owner + accepted members + pending invites)
    const seatInfo = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM TeamMembers WHERE tenant_id = @tenantId AND accepted_at IS NOT NULL) AS accepted,
            (SELECT COUNT(*) FROM TeamInvitations WHERE tenant_id = @tenantId AND accepted_at IS NULL AND expires_at > GETUTCDATE()) AS pending
        `);
      return r.recordset[0] ?? { accepted: 0, pending: 0 };
    });

    // owner counts as 1, so total = 1 (owner) + accepted members + pending
    const totalUsed = 1 + (seatInfo.accepted ?? 0) + (seatInfo.pending ?? 0);
    if (totalUsed >= maxSeats) {
      return NextResponse.json(
        { error: `Seat limit reached. Your ${PLAN_LIMITS[planType].label} plan allows ${maxSeats} seats total (including owner).` },
        { status: 400 }
      );
    }

    // Check if already a member or has a pending invite
    const existing = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .input('email',    mssql.NVarChar(255),    email)
        .query(`
          SELECT 'member' AS kind FROM TeamMembers    WHERE tenant_id = @tenantId AND email = @email
          UNION ALL
          SELECT 'invite' AS kind FROM TeamInvitations WHERE tenant_id = @tenantId AND invited_email = @email AND accepted_at IS NULL AND expires_at > GETUTCDATE()
        `);
      return r.recordset;
    });

    if (existing.some((r: any) => r.kind === 'member')) {
      return NextResponse.json({ error: 'This person is already a team member' }, { status: 409 });
    }
    if (existing.some((r: any) => r.kind === 'invite')) {
      return NextResponse.json({ error: 'A pending invite already exists for this email' }, { status: 409 });
    }

    // Load tenant's current domains, then narrow to selected ones if specified
    const allDomains = await withAdminDb(async (req) => {
      const r = await req
        .input('tid', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT domain_id FROM Domains WHERE tenant_id = @tid`);
      return r.recordset.map((d: any) => d.domain_id as string);
    });
    const domains = domainIds && domainIds.length > 0
      ? allDomains.filter(id => domainIds.includes(id))
      : allDomains;

    // Generate secure token
    const rawToken  = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Insert TeamMember + TeamInvitation + MemberDomainAccess atomically
    const adminPool = await getAdminPool();
    const tx = new mssql.Transaction(adminPool);
    await tx.begin();

    let memberId!: string;
    try {
      const req = new mssql.Request(tx);

      req.input('tenantId',      mssql.UniqueIdentifier, tenantId);
      req.input('email',         mssql.NVarChar(255),    email);
      req.input('role',          mssql.NVarChar(50),     role);
      await req.query(`
        INSERT INTO TeamMembers (tenant_id, email, role, invited_by)
        VALUES (@tenantId, @email, @role, @tenantId)
      `);

      const memberRow = await req.query(`
        SELECT member_id FROM TeamMembers
        WHERE tenant_id = @tenantId AND email = @email AND accepted_at IS NULL
        ORDER BY created_at DESC
      `);
      memberId = memberRow.recordset[0]?.member_id as string;
      if (!memberId) throw new Error('Failed to retrieve member_id');

      req.input('memberId',  mssql.UniqueIdentifier,   memberId);
      req.input('tokenHash', mssql.NVarChar(64),        tokenHash);
      req.input('invitedBy', mssql.UniqueIdentifier,   tenantId);
      req.input('expiresAt', mssql.DateTime2,           expiresAt);
      await req.query(`
        INSERT INTO TeamInvitations (tenant_id, invited_email, role, token_hash, invited_by, expires_at)
        VALUES (@tenantId, @email, @role, @tokenHash, @invitedBy, @expiresAt)
      `);

      for (let i = 0; i < domains.length; i++) {
        const param = `domainId${i}`;
        req.input(param, mssql.UniqueIdentifier, domains[i]);
        await req.query(`
          INSERT INTO MemberDomainAccess (member_id, domain_id)
          VALUES (@memberId, @${param})
        `);
      }

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    // Send invitation email
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`;
    const { subject, html } = buildTeamInvitationEmail({
      inviteeEmail: email,
      inviterEmail: session.user.email ?? '',
      role,
      acceptUrl,
      expiresInDays: 7,
    });

    try {
      await resend.emails.send({
        from:     'AdLeak Shield <noreply@adleakshield.com>',
        reply_to: session.user.email ?? undefined,
        to:       email,
        subject,
        html,
        text:     `${session.user.email} has invited you to join their AdLeak Shield workspace as a ${role}.\n\nAccept your invitation here:\n${acceptUrl}\n\nThis link expires in 7 days. If you weren't expecting this, you can safely ignore it.`,
      });
    } catch (emailErr) {
      // Non-fatal — invitation is created; user can resend later
      console.error('[team/invite] Email send failed (non-fatal):', emailErr);
    }

    return NextResponse.json({ success: true, memberId, message: `Invitation sent to ${email}` });
  } catch (error) {
    console.error('[team/invite POST]', error);
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
  }
}
