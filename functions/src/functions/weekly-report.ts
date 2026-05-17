// =============================================================================
// AdLeak Shield — Weekly Report Timer Function
// functions/src/functions/weekly-report.ts
//
// Fires every Monday at 08:00 UTC.
// For each active tenant with bounce traffic in the past 7 days, sends a
// weekly waste report email listing their top 5 wasted keywords.
// =============================================================================

import { app, type InvocationContext } from "@azure/functions";
import mssql from "mssql";
import { withAdminDb } from "../lib/db.js";
import { sendWeeklyReportEmail, type WeeklyKeyword } from "../lib/email.js";

interface TenantRow {
  tenant_id: string;
  email: string;
}

interface LeakRow {
  keyword: string;
  match_type: string | null;
  bounce_clicks: number;
  estimated_waste: number;
}

async function getActiveTenants(): Promise<TenantRow[]> {
  return withAdminDb(async (req) => {
    const result = await req.query(`
      SELECT tenant_id, email
      FROM Tenants
      WHERE subscription_status = 'active'
         OR (subscription_status = 'trialing' AND trial_ends_at > GETUTCDATE())
    `);
    return result.recordset as TenantRow[];
  });
}

async function getTenantWeeklyLeaks(tenantId: string): Promise<LeakRow[]> {
  return withAdminDb(async (req) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const result = await req
      .input("tenantId", mssql.UniqueIdentifier, tenantId)
      .input("startDate", mssql.DateTime, since)
      .input("endDate", mssql.DateTime, now)
      .query(`
        SELECT TOP 5
          s.keyword,
          s.match_type,
          SUM(CASE WHEN s.is_bounce = 1 THEN 1 ELSE 0 END) AS bounce_clicks,
          SUM(CASE WHEN s.is_bounce = 1 THEN 1 ELSE 0 END)
            * COALESCE(s.session_cpc, c.avg_cpc) AS estimated_waste
        FROM Sessions s
        INNER JOIN Campaigns c ON s.campaign_id = c.campaign_id
        WHERE s.tenant_id = @tenantId
          AND s.started_at >= @startDate
          AND s.started_at <= @endDate
          AND s.keyword IS NOT NULL
        GROUP BY s.keyword, s.match_type, COALESCE(s.session_cpc, c.avg_cpc)
        HAVING SUM(CASE WHEN s.is_bounce = 1 THEN 1 ELSE 0 END) > 0
        ORDER BY estimated_waste DESC
      `);

    return result.recordset as LeakRow[];
  });
}

export async function weeklyReportHandler(
  _timer: unknown,
  context: InvocationContext
): Promise<void> {
  context.log("[WeeklyReport] Starting weekly report run");

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const dashboardUrl = `${appUrl}/dashboard`;

  let tenants: TenantRow[];
  try {
    tenants = await getActiveTenants();
  } catch (err) {
    context.error("[WeeklyReport] Failed to fetch tenants", {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  context.log(`[WeeklyReport] ${tenants.length} active tenant(s) to process`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      const leaks = await getTenantWeeklyLeaks(tenant.tenant_id);

      if (leaks.length === 0) {
        skipped++;
        continue;
      }

      const topKeywords: WeeklyKeyword[] = leaks.map((r) => ({
        keyword: r.keyword,
        matchType: r.match_type,
        bounceClicks: r.bounce_clicks,
        estimatedWaste: r.estimated_waste ?? 0,
      }));

      const totalWaste = topKeywords.reduce((s, k) => s + k.estimatedWaste, 0);
      const totalBounceClicks = topKeywords.reduce((s, k) => s + k.bounceClicks, 0);

      await sendWeeklyReportEmail({
        to: tenant.email,
        totalWaste,
        totalBounceClicks,
        topKeywords,
        dashboardUrl,
      });

      sent++;
      context.log(`[WeeklyReport] Sent to ${tenant.email}`);
    } catch (err) {
      failed++;
      context.error(`[WeeklyReport] Failed for tenant ${tenant.tenant_id}`, {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  context.log(
    `[WeeklyReport] Done — sent: ${sent}, skipped (no waste): ${skipped}, failed: ${failed}`
  );
}

// Monday 08:00 UTC — Azure Functions 6-part CRON: {second} {minute} {hour} {day} {month} {day-of-week}
app.timer("weekly-report", {
  schedule: "0 0 8 * * 1",
  handler: weeklyReportHandler,
});
