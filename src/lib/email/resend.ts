// =============================================================================
// AdLeak Shield — Resend Email Utility
// src/lib/email/resend.ts
//
// WHAT IS RESEND?
// Resend is a transactional email service. "Transactional" means emails
// triggered by user actions — password resets, welcome emails, etc.
// It has very high deliverability (emails don't go to spam).
//
// This file has one function for now: sendPasswordResetEmail.
// The Monday weekly report email is built in Phase 6.
//
// The API key is stored in Key Vault — never in code or env vars.
// For local development, it falls back to the RESEND_API_KEY env var
// which you set in .env.local during development.
// =============================================================================

import { Resend } from "resend";

// In production: the Key Vault reference is injected as an app setting
// In development: read from .env.local
function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local for development."
    );
  }
  return new Resend(apiKey);
}

// =============================================================================
// PASSWORD RESET EMAIL
// =============================================================================

interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: PasswordResetEmailParams): Promise<void> {
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    // IMPORTANT: Replace 'noreply@yourdomain.com' with your actual verified
    // sender domain in Resend. You set this up in the Resend dashboard.
    // Until you have a custom domain, use onboarding@resend.dev for testing.
    from: "AdLeak Shield <notifications@adleakshield.com>",
    to,
    subject: "Reset your AdLeak Shield password",
    html: passwordResetTemplate(resetUrl),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

// =============================================================================
// EMAIL TEMPLATE
// Plain but professional. No external images or fonts — maximum deliverability.
// =============================================================================

function passwordResetTemplate(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:24px 40px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">
                AdLeak Shield
              </p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;letter-spacing:-0.5px;">
                Reset your password
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                We received a request to reset the password for your AdLeak Shield account. 
                Click the button below to choose a new password.
              </p>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#111827;">
                    <a href="${resetUrl}" 
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:6px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
                This link expires in <strong>1 hour</strong> and can only be used once. 
                If you didn't request a password reset, you can safely ignore this email — 
                your password will not change.
              </p>
              
              <!-- Fallback URL -->
              <p style="margin:16px 0 0;font-size:12px;color:#d1d5db;">
                If the button doesn't work, copy and paste this URL into your browser:<br>
                <span style="color:#6b7280;word-break:break-all;">${resetUrl}</span>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                AdLeak Shield · Helping UK businesses stop wasting Google Ads budget
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}


// =============================================================================
// EMAIL VERIFICATION EMAIL
// =============================================================================

interface VerificationEmailParams {
  to: string;
  verificationUrl: string;
}

export async function sendVerificationEmail({
  to,
  verificationUrl,
}: VerificationEmailParams): Promise<void> {
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: "AdLeak Shield <notifications@adleakshield.com>",
    to,
    subject: "Verify your AdLeak Shield account",
    html: verificationEmailTemplate(verificationUrl),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

function verificationEmailTemplate(verificationUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:24px 40px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">
                AdLeak Shield
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;letter-spacing:-0.5px;">
                Verify your email
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Welcome to AdLeak Shield. Click the button below to verify your
                email address and start your 7-day free trial.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#111827;">
                    <a href="${verificationUrl}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:6px;">
                      Verify email address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
                This link expires in <strong>24 hours</strong>. If you didn't
                create an AdLeak Shield account, you can safely ignore this email.
              </p>
              <p style="margin:16px 0 0;font-size:12px;color:#d1d5db;">
                If the button doesn't work, copy and paste this URL into your browser:<br>
                <span style="color:#6b7280;word-break:break-all;">${verificationUrl}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                AdLeak Shield · Helping UK businesses stop wasting Google Ads budget
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}