// =============================================================================
// AdLeak Shield — Email Utility (Azure Functions)
// functions/src/lib/email.ts
//
// Standalone email helpers for Azure Functions. Cannot import from the Next.js
// src/ directory, so Resend is called directly here.
// =============================================================================

import { Resend } from "resend";

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}

// =============================================================================
// WEEKLY REPORT EMAIL
// =============================================================================

export interface WeeklyKeyword {
  keyword: string;
  matchType: string | null;
  bounceClicks: number;
  estimatedWaste: number;
}

interface WeeklyReportParams {
  to: string;
  totalWaste: number;
  totalBounceClicks: number;
  topKeywords: WeeklyKeyword[];
  dashboardUrl: string;
  cleanWeek?: boolean;
}

export async function sendWeeklyReportEmail({
  to,
  totalWaste,
  totalBounceClicks,
  topKeywords,
  dashboardUrl,
}: WeeklyReportParams): Promise<void> {
  const resend = getResendClient();
  const from = process.env.RESEND_FROM_EMAIL ?? "AdLeak Shield <onboarding@resend.dev>";

  const wasteFormatted = `£${totalWaste.toFixed(2)}`;
  const cleanWeek = topKeywords.length === 0;
  const subject = cleanWeek
    ? "Clean week — no ad budget wasted last week"
    : `You lost ${wasteFormatted} last week on ${totalBounceClicks} junk click${totalBounceClicks !== 1 ? "s" : ""} — view the list`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: weeklyReportTemplate({ totalWaste, totalBounceClicks, topKeywords, dashboardUrl, cleanWeek }),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

function weeklyReportTemplate({
  totalWaste,
  totalBounceClicks,
  topKeywords,
  dashboardUrl,
  cleanWeek,
}: Omit<WeeklyReportParams, "to">): string {
  const wasteFormatted = `£${totalWaste.toFixed(2)}`;

  const keywordRows = topKeywords
    .map(
      (k) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;font-weight:500;">
          ${escapeHtml(k.keyword)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-transform:capitalize;">
          ${escapeHtml(k.matchType ?? "—")}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;text-align:center;">
          ${k.bounceClicks}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#dc2626;font-weight:600;text-align:right;">
          £${k.estimatedWaste.toFixed(2)}
        </td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your weekly ad waste report</title>
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

          <!-- Summary -->
          <tr>
            <td style="padding:40px 40px 24px;">
              ${cleanWeek ? `
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.5px;">
                Clean week — no waste detected
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Good news: AdLeak Shield found no junk traffic in your Google Ads campaigns last week. Your budget is being well spent.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#f0fdf4;border-radius:8px;padding:24px;border:1px solid #bbf7d0;text-align:center;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px;">Estimated Waste</p>
                    <p style="margin:0;font-size:36px;font-weight:700;color:#15803d;">£0.00</p>
                    <p style="margin:8px 0 0;font-size:13px;color:#16a34a;">AdLeak Shield is working</p>
                  </td>
                </tr>
              </table>
              ` : `
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.5px;">
                Your weekly waste report
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Here's what your Google Ads budget lost to junk traffic in the past 7 days.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td width="48%" style="background:#fef2f2;border-radius:8px;padding:20px 24px;border:1px solid #fecaca;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">Estimated Waste</p>
                    <p style="margin:0;font-size:28px;font-weight:700;color:#b91c1c;">${wasteFormatted}</p>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:#f9fafb;border-radius:8px;padding:20px 24px;border:1px solid #e5e7eb;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Bounce Clicks</p>
                    <p style="margin:0;font-size:28px;font-weight:700;color:#374151;">${totalBounceClicks}</p>
                  </td>
                </tr>
              </table>
              <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Top wasted keywords</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Keyword</th>
                    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Match</th>
                    <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Bounces</th>
                    <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Wasted</th>
                  </tr>
                </thead>
                <tbody>${keywordRows}</tbody>
              </table>
              `}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 40px;">
              <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
                ${cleanWeek
                  ? "Log in to your dashboard to review your campaigns and visitor journeys."
                  : "Pause these keywords in Google Ads to stop the waste. Log in to your dashboard to see the full breakdown and visitor journeys."
                }
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#111827;">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:6px;">
                      View full dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                AdLeak Shield · Helping UK businesses stop wasting Google Ads budget<br>
                You're receiving this because you have an active AdLeak Shield account.
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
