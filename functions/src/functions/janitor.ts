// =============================================================================
// AdLeak Shield — GDPR Janitor Function
// functions/src/functions/janitor.ts
//
// Timer Trigger: runs every night at 02:00 UTC.
//
// RETENTION POLICY:
//   ┌──────────────────────────────────┬───────────────────────────────────────┐
//   │ Tenant state                     │ Action                                │
//   ├──────────────────────────────────┼───────────────────────────────────────┤
//   │ Active subscriber                │ Keep forever — no action              │
//   │ Past-due (payment grace period)  │ Keep — treat same as active           │
//   │ Cancelled subscriber             │ Warn day 85 · Purge day 90            │
//   │ Expired trial (never subscribed) │ Warn day 25 · Purge day 30            │
//   └──────────────────────────────────┴───────────────────────────────────────┘
//
// "Cancelled subscriber" = subscription_status = 'canceled' AND stripe_customer_id IS NOT NULL
// "Expired trial"        = trial_ends_at < NOW  AND stripe_customer_id IS NULL
//
// Purge means: DELETE all Sessions, JourneyEvents, ClickLogs for that tenant.
// Campaigns and Domains are NOT deleted (those belong to the business owner,
// not visitor PII). Full account wipe happens only via the account-delete route.
//
// REQUIRED SQL (run once before deploying — migration at bottom of file):
//   ALTER TABLE Tenants ADD subscription_cancelled_at DATETIME2 NULL;
//   ALTER TABLE Tenants ADD data_deletion_warned_at   DATETIME2 NULL;
//   ALTER TABLE JanitorLog ADD tenants_purged INT NOT NULL DEFAULT 0;
//   ALTER TABLE JanitorLog ADD tenants_warned INT NOT NULL DEFAULT 0;
//   CREATE OR ALTER PROCEDURE dbo.sp_PurgeTenantData ...
// =============================================================================

import { app, type InvocationContext } from "@azure/functions";
import mssql from "mssql";
import { withAdminDb } from "../lib/db.js";
import { sendDataDeletionWarningEmail } from "../lib/email.js";

// ---------------------------------------------------------------------------
// Retention policy constants
// ---------------------------------------------------------------------------
const CANCELLED_WARN_DAYS  = 85;
const CANCELLED_PURGE_DAYS = 90;
const TRIAL_WARN_DAYS      = 25;
const TRIAL_PURGE_DAYS     = 30;

const MS_PER_DAY = 86_400_000;

const APP_URL      = process.env.APP_URL ?? "https://adleakshield.com";
// Both email CTAs point to /dashboard — cancelled users click "Manage Billing"
// there to access the Stripe portal; trial users click "Subscribe now" there.
const DASHBOARD_URL = `${APP_URL}/dashboard`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TenantRow {
  tenant_id:                 string;
  email:                     string;
  subscription_status:       string;    // 'active' | 'trialing' | 'canceled' | 'past_due'
  stripe_customer_id:        string | null;
  trial_ends_at:             Date   | null;
  subscription_cancelled_at: Date   | null;
  data_deletion_warned_at:   Date   | null;
}

type TenantOutcome = "skipped" | "warned" | "purged";

// ---------------------------------------------------------------------------
// Timer trigger — 02:00 UTC every night
// ---------------------------------------------------------------------------
app.timer("janitor", {
  schedule: "0 0 2 * * *",
  runOnStartup: false,

  handler: async (_timer: unknown, context: InvocationContext): Promise<void> => {
    context.log("[Janitor] Starting smart GDPR retention sweep");

    const now = new Date();
    let tenantsPurged = 0;
    let tenantsWarned = 0;
    let errorCount    = 0;
    const errorMessages: string[] = [];

    // 1. Load all tenants — Tenants table has no RLS, withAdminDb is safe
    let tenants: TenantRow[];
    try {
      tenants = await withAdminDb(async (req) => {
        const r = await req.query(`
          SELECT
            CAST(tenant_id AS NVARCHAR(36))  AS tenant_id,
            email,
            subscription_status,
            stripe_customer_id,
            trial_ends_at,
            subscription_cancelled_at,
            data_deletion_warned_at
          FROM Tenants
          WHERE deleted_at IS NULL
        `);
        return r.recordset as TenantRow[];
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      context.error("[Janitor] Fatal — could not load tenants:", msg);
      await writeJanitorLog(now, 0, 0, msg, context);
      throw err;
    }

    context.log(`[Janitor] Loaded ${tenants.length} tenant(s)`);

    // 2. Per-tenant smart retention decisions
    for (const tenant of tenants) {
      try {
        const outcome = await processTenant(tenant, now, context);
        if (outcome === "purged") tenantsPurged++;
        if (outcome === "warned") tenantsWarned++;
      } catch (err) {
        errorCount++;
        const msg = err instanceof Error ? err.message : String(err);
        errorMessages.push(`${tenant.tenant_id}: ${msg}`);
        context.error(`[Janitor] Error on tenant ${tenant.tenant_id}:`, err);
      }
    }

    context.log(
      `[Janitor] Complete — purged: ${tenantsPurged}, warned: ${tenantsWarned}, errors: ${errorCount}`
    );

    const finalStatus = errorCount > 0 && tenantsPurged === 0 && tenantsWarned === 0
      ? `error (${errorCount} failures)`
      : "success";

    await writeJanitorLog(now, tenantsPurged, tenantsWarned,
      errorMessages.length > 0
        ? `${errorCount} tenant(s) had errors — ${errorMessages.join(' | ')}`
        : null,
      context);
  },
});

// ---------------------------------------------------------------------------
// Per-tenant retention logic
// ---------------------------------------------------------------------------
async function processTenant(
  tenant: TenantRow,
  now:    Date,
  ctx:    InvocationContext,
): Promise<TenantOutcome> {
  const status = tenant.subscription_status;

  // ── Active or past-due: keep data indefinitely ────────────────────────────
  if (status === "active" || status === "past_due") {
    return "skipped";
  }

  // ── Cancelled subscriber ──────────────────────────────────────────────────
  // Criteria: status = 'canceled' AND has a stripe_customer_id (i.e. was a paid user)
  if (status === "canceled" && tenant.stripe_customer_id) {
    // If subscription_cancelled_at wasn't stamped by the webhook (e.g. legacy rows),
    // default to "now" so they get the full 90-day window from today.
    let cancelledAt = tenant.subscription_cancelled_at
      ? new Date(tenant.subscription_cancelled_at)
      : null;

    if (!cancelledAt) {
      cancelledAt = now;
      await stampCancelledAt(tenant.tenant_id, now);
      ctx.log(`[Janitor] Stamped subscription_cancelled_at = now for tenant ${tenant.tenant_id}`);
      // They just got stamped today — day 0. Return immediately; will act in 85+ days.
      return "skipped";
    }

    const daysSince = daysBetween(cancelledAt, now);

    if (daysSince >= CANCELLED_PURGE_DAYS) {
      ctx.log(`[Janitor] Purging cancelled subscriber ${tenant.tenant_id} (day ${daysSince})`);
      await purgeTenantData(tenant.tenant_id);
      return "purged";
    }

    if (daysSince >= CANCELLED_WARN_DAYS && !tenant.data_deletion_warned_at) {
      const daysLeft     = CANCELLED_PURGE_DAYS - daysSince;
      const deletionDate = formatDate(addDays(cancelledAt, CANCELLED_PURGE_DAYS));

      // Only attempt the email when the address is well-formed. An invalid address
      // (e.g. a malformed test account) makes Resend throw — we skip the send but
      // still stamp warned_at so it doesn't retry (and fail) every night. The purge
      // at day 90 proceeds regardless; it doesn't need email. A VALID address that
      // fails to send (transient outage) still throws below → not stamped → retried.
      if (isValidEmail(tenant.email)) {
        ctx.log(`[Janitor] Warning cancelled subscriber ${tenant.tenant_id} (day ${daysSince}, ${daysLeft}d left)`);
        await sendDataDeletionWarningEmail({
          to:            tenant.email,
          daysLeft,
          deletionDate,
          wasSubscriber: true,
          dashboardUrl:  DASHBOARD_URL,
          billingUrl:    DASHBOARD_URL,  // "Manage Billing" button on dashboard opens Stripe portal
        });
      } else {
        ctx.warn(`[Janitor] Skipping warning email for cancelled subscriber ${tenant.tenant_id} — invalid email "${tenant.email}"`);
      }

      await stampWarnedAt(tenant.tenant_id, now);
      return "warned";
    }

    return "skipped";
  }

  // ── Expired trial (never converted to paid) ───────────────────────────────
  // Criteria: trial_ends_at is in the past AND no stripe_customer_id
  const trialEnded = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;

  if (trialEnded && trialEnded < now && !tenant.stripe_customer_id) {
    const daysSince = daysBetween(trialEnded, now);

    if (daysSince >= TRIAL_PURGE_DAYS) {
      ctx.log(`[Janitor] Purging expired-trial tenant ${tenant.tenant_id} (day ${daysSince})`);
      await purgeTenantData(tenant.tenant_id);
      return "purged";
    }

    if (daysSince >= TRIAL_WARN_DAYS && !tenant.data_deletion_warned_at) {
      const daysLeft     = TRIAL_PURGE_DAYS - daysSince;
      const deletionDate = formatDate(addDays(trialEnded, TRIAL_PURGE_DAYS));

      // See the cancelled-subscriber branch above — skip the email for malformed
      // addresses but still stamp so it doesn't fail every night; purge at day 30
      // proceeds regardless. Valid addresses that fail to send are still retried.
      if (isValidEmail(tenant.email)) {
        ctx.log(`[Janitor] Warning expired-trial tenant ${tenant.tenant_id} (day ${daysSince}, ${daysLeft}d left)`);
        await sendDataDeletionWarningEmail({
          to:            tenant.email,
          daysLeft,
          deletionDate,
          wasSubscriber: false,
          dashboardUrl:  DASHBOARD_URL,
          billingUrl:    DASHBOARD_URL,
        });
      } else {
        ctx.warn(`[Janitor] Skipping warning email for expired-trial tenant ${tenant.tenant_id} — invalid email "${tenant.email}"`);
      }

      await stampWarnedAt(tenant.tenant_id, now);
      return "warned";
    }
  }

  return "skipped";
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Call sp_PurgeTenantData to wipe all sessions/events/clicks for a tenant. */
async function purgeTenantData(tenantId: string): Promise<void> {
  await withAdminDb(async (req) => {
    req.input("tenantId", mssql.UniqueIdentifier, tenantId);
    await req.execute("sp_PurgeTenantData");
  });
}

/** Stamp subscription_cancelled_at if not already set. */
async function stampCancelledAt(tenantId: string, at: Date): Promise<void> {
  await withAdminDb(async (req) => {
    req
      .input("tenantId",    mssql.UniqueIdentifier, tenantId)
      .input("cancelledAt", mssql.DateTime2,        at);
    await req.query(`
      UPDATE Tenants
      SET    subscription_cancelled_at = @cancelledAt
      WHERE  tenant_id = @tenantId
        AND  subscription_cancelled_at IS NULL
    `);
  });
}

/** Stamp data_deletion_warned_at to prevent duplicate warning emails. */
async function stampWarnedAt(tenantId: string, at: Date): Promise<void> {
  await withAdminDb(async (req) => {
    req
      .input("tenantId", mssql.UniqueIdentifier, tenantId)
      .input("warnedAt", mssql.DateTime2,        at);
    await req.query(`
      UPDATE Tenants
      SET    data_deletion_warned_at = @warnedAt
      WHERE  tenant_id = @tenantId
    `);
  });
}

/** Write a summary row to JanitorLog. Best-effort — never throws. */
async function writeJanitorLog(
  ranAt:         Date,
  tenantsPurged: number,
  tenantsWarned: number,
  errorMsg:      string | null,
  ctx:           InvocationContext,
): Promise<void> {
  try {
    await withAdminDb(async (req) => {
      req
        .input("ranAt",         mssql.DateTime2,     ranAt)
        .input("tenantsPurged", mssql.Int,           tenantsPurged)
        .input("tenantsWarned", mssql.Int,           tenantsWarned)
        .input("status",        mssql.NVarChar(20),  errorMsg ? "error" : "success")
        .input("errorMsg",      mssql.NVarChar(500), errorMsg?.substring(0, 500) ?? null);
      await req.query(`
        INSERT INTO JanitorLog
          (ran_at, tenants_purged, tenants_warned, status, error_message,
           deleted_clicklogs, deleted_journey_events, deleted_sessions, retention_days)
        VALUES
          (@ranAt, @tenantsPurged, @tenantsWarned, @status, @errorMsg, 0, 0, 0, 0)
      `);
    });
  } catch (logErr) {
    ctx.warn("[Janitor] Could not write to JanitorLog:", logErr);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Basic RFC-ish email shape check — enough to keep malformed test addresses
 *  from making Resend throw. Not a full validator; the signup flow already
 *  enforces real addresses, so this only catches broken/legacy rows. */
function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/** Format as "15 January 2026" */
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });
}

// =============================================================================
// SQL MIGRATION — run this ONCE in Azure Data Studio before deploying
// =============================================================================
//
// -- 1. Add new columns to Tenants
// ALTER TABLE Tenants ADD subscription_cancelled_at DATETIME2 NULL;
// ALTER TABLE Tenants ADD data_deletion_warned_at   DATETIME2 NULL;
//
// -- 2. Add new columns to JanitorLog
// ALTER TABLE JanitorLog ADD tenants_purged INT NOT NULL DEFAULT 0;
// ALTER TABLE JanitorLog ADD tenants_warned INT NOT NULL DEFAULT 0;
//
// -- 3. sp_PurgeTenantData — deletes ALL tracking data for one tenant
// --    EXECUTE AS OWNER bypasses RLS (dbo is db_owner)
// CREATE OR ALTER PROCEDURE dbo.sp_PurgeTenantData
//     @tenantId UNIQUEIDENTIFIER
// WITH EXECUTE AS OWNER
// AS
// BEGIN
//     SET NOCOUNT ON;
//
//     -- Delete JourneyEvents for this tenant's sessions
//     DELETE FROM JourneyEvents
//     WHERE session_id IN (
//         SELECT session_id FROM Sessions WHERE tenant_id = @tenantId
//     );
//
//     -- Delete ClickLogs for this tenant
//     DELETE FROM ClickLogs
//     WHERE tenant_id = @tenantId;
//
//     -- Delete Sessions for this tenant
//     DELETE FROM Sessions
//     WHERE tenant_id = @tenantId;
//
//     -- Return row counts to caller
//     SELECT
//         @@ROWCOUNT          AS deleted_sessions,
//         0                   AS deleted_journey_events,
//         0                   AS deleted_clicklogs;
// END;
//
// NOTE: The SELECT above returns only sessions count because @@ROWCOUNT resets
// after each statement. For accurate counts, use output variables:
//
// CREATE OR ALTER PROCEDURE dbo.sp_PurgeTenantData
//     @tenantId UNIQUEIDENTIFIER
// WITH EXECUTE AS OWNER
// AS
// BEGIN
//     SET NOCOUNT ON;
//
//     DECLARE @delJE INT = 0;
//     DECLARE @delCL INT = 0;
//     DECLARE @delS  INT = 0;
//
//     DELETE FROM JourneyEvents
//     WHERE session_id IN (
//         SELECT session_id FROM Sessions WHERE tenant_id = @tenantId
//     );
//     SET @delJE = @@ROWCOUNT;
//
//     DELETE FROM ClickLogs WHERE tenant_id = @tenantId;
//     SET @delCL = @@ROWCOUNT;
//
//     DELETE FROM Sessions WHERE tenant_id = @tenantId;
//     SET @delS = @@ROWCOUNT;
//
//     SELECT @delCL AS deleted_clicklogs,
//            @delJE AS deleted_journey_events,
//            @delS  AS deleted_sessions;
// END;
//
// -- 4. (OPTIONAL) Fix sp_JanitorPurge column names if you still want a global
// --    nightly trim of very old data on active accounts (not strictly needed now):
// --    Change  `logged_at`   → `clicked_at`   in ClickLogs DELETE
// --    Change  `occurred_at` → `occurred_at`   (JourneyEvents — verify this is correct)
