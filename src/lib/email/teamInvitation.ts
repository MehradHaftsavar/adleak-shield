export interface TeamInvitationEmailOptions {
  inviteeEmail: string;
  inviterEmail: string;
  role: 'editor' | 'visitor';
  acceptUrl: string;
  expiresInDays?: number;
}

export function buildTeamInvitationEmail(opts: TeamInvitationEmailOptions): {
  subject: string;
  html: string;
} {
  const { inviteeEmail, inviterEmail, role, acceptUrl, expiresInDays = 7 } = opts;

  const roleLabel = role === 'editor' ? 'Editor' : 'Viewer';
  const roleDesc  = role === 'editor'
    ? 'view data and manage campaigns'
    : 'view data (read-only)';

  const subject = `${inviterEmail} shared AdLeak Shield access with you`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

          <!-- Header -->
          <tr>
            <td style="background:#4f46e5;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">AdLeak Shield</p>
              <p style="margin:6px 0 0;color:#c7d2fe;font-size:13px;">Google Ads fraud protection</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">
                You've been invited
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                <strong>${inviterEmail}</strong> has invited you to join their AdLeak Shield workspace
                as a <strong>${roleLabel}</strong>. As a ${roleLabel} you can ${roleDesc}.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#4f46e5;border-radius:8px;">
                    <a href="${acceptUrl}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:12px;color:#4f46e5;word-break:break-all;">
                ${acceptUrl}
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                This invitation expires in ${expiresInDays} days. If you weren't expecting this email
                you can safely ignore it — no account will be created.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                &copy; ${new Date().getFullYear()} AdLeak Shield &bull;
                <a href="https://www.adleakshield.com/privacy" style="color:#9ca3af;">Privacy Policy</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
