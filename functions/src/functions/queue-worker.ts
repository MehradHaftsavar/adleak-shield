// =============================================================================
// AdLeak Shield — Queue Worker Function
// functions/src/functions/queue-worker.ts
// =============================================================================

import {
  app,
  type InvocationContext,
} from "@azure/functions";
import mssql from "mssql";
import {
  QueueMessageSchema,
  type QueueMessage,
  type EventType,
} from "../lib/schemas.js";
import { withTenantDb, withAdminDb } from "../lib/db.js";

const THANK_YOU_PATHS = [
  // Order / purchase confirmations
  '/thank-you', '/thankyou', '/thank_you', '/thanks',
  '/order-confirmed', '/order-confirmation', '/order-complete', '/order-completed',
  '/order-success', '/order-placed',
  '/checkout/success', '/checkout/order-received', '/checkout/thankyou',
  '/checkout/thank-you', '/checkout/complete', '/checkout/confirmed',
  '/payment-success', '/payment-confirmed', '/payment-complete',
  '/purchase-success', '/purchase-confirmed', '/purchase-complete',
  '/confirmation', '/confirmed', '/receipt',
  // Signup / registration (SaaS)
  '/signup', '/sign-up', '/sign_up', '/register', '/registration',
  '/get-started', '/get_started', '/onboarding', '/welcome',
  '/success', '/account-created', '/account/created',
  // Contact / enquiry (service businesses) — note: '/contact' itself is
  // deliberately excluded. Merely landing on a contact page isn't a
  // conversion; the actual form submission is tracked separately via the
  // real "submit" event, which fires regardless of this list.
  '/enquiry-sent', '/enquiry-received',
  '/message-sent', '/message-received',
  // Quote / booking (trades)
  '/quote', '/get-a-quote', '/free-quote', '/request-a-quote', '/quote-request',
  '/book', '/booking', '/book-now', '/book-online', '/book-appointment',
  '/appointment', '/appointment-confirmed', '/appointment-booked',
  '/callback', '/request-callback', '/call-back',
];

function isThankYouPage(path: string | null | undefined): boolean {
  if (!path) return false;
  const normalised = path.toLowerCase().replace(/\/+$/, '');
  return THANK_YOU_PATHS.some(p =>
    normalised === p ||
    normalised.startsWith(p + '/') ||
    normalised.startsWith(p + '?')
  );
}

// Google Ads' {matchtype} ValueTrack parameter sends single-letter codes on
// real ad clicks ("e"/"p"/"b"), not full words — only our own manual test
// URLs use full words. Normalise both into one canonical lowercase form so
// storage, filters, and display are consistent regardless of source.
function normaliseMatchType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  switch (v) {
    case "e": return "exact";
    case "p": return "phrase";
    case "b": return "broad";
    case "exact":
    case "phrase":
    case "broad":
      return v;
    default:
      // Unrecognised (e.g. Google's "u" for unknown match type) — keep as-is
      // rather than discarding it.
      return v;
  }
}

// Strips the www. prefix and lowercases so 'www.Example.com' and 'example.com'
// compare equal. Module-scoped because both the domain-mismatch check and the
// tenant lookup below must normalise identically.
const normaliseDomain = (d: string) => d.toLowerCase().replace(/^www\./, '');

interface CampaignLookup {
  tenantId: string;
  campaignId: string;
  domainName: string;
  googleCampaignId: string;
}

// ---------------------------------------------------------------------------
// WHY THESE TWO HELPERS EXIST — do not replace them with withAdminDb.
//
// The RLS predicate (fn_tenantSecurityPredicate) grants a bypass to
// USER_NAME() = 'adleak_admin_identity'. That user was never created, so the
// bypass is dead: any connection WITHOUT SESSION_CONTEXT('TenantId') sees ZERO
// rows in Sessions/Tenants/Domains. Proven directly — clearing the context and
// running SELECT COUNT(*) FROM Sessions returns 0 against a table holding 139+
// rows.
//
// withAdminDb sets no context, so it only worked when it happened to draw a
// pooled connection still carrying context from an earlier withTenantDb call.
// Fresh connection => session lookup returns nothing => the event was
// discarded as an "orphan". That silently lost events on ~14% of sessions.
//
// The fix: resolve the tenant from CampaignLookupCache (which has no RLS
// policy and is kept in sync by trg_CampaignCache_Update), then set the
// context in the SAME SQL batch as the read, so it cannot depend on which
// connection we draw.
// ---------------------------------------------------------------------------

async function lookupTenantByDomain(domainName: string): Promise<string | null> {
  const normalised = normaliseDomain(domainName).substring(0, 253);
  return withAdminDb(async (request) => {
    const result = await request
      .input("domainName", mssql.NVarChar, normalised)
      .query(
        `SELECT TOP 1 tenant_id
         FROM CampaignLookupCache
         WHERE LOWER(domain_name) = @domainName
            OR LOWER(domain_name) = 'www.' + @domainName`
      );
    return result.recordset[0]?.tenant_id ?? null;
  });
}

async function findSessionByFingerprint(
  tenantId: string,
  fingerprint: string
): Promise<{ tenant_id: string; campaign_id: string } | null> {
  return withAdminDb(async (request) => {
    const result = await request
      .input("tid", mssql.UniqueIdentifier, tenantId)
      .input("fp", mssql.NVarChar, fingerprint.substring(0, 64))
      .query(
        `SET NOCOUNT ON;
         DECLARE @t VARBINARY(128) = CAST(@tid AS VARBINARY(128));
         EXEC sp_set_session_context N'TenantId', @t, @read_only = 0;
         SELECT TOP 1 tenant_id, campaign_id
         FROM Sessions WHERE session_fingerprint = @fp;`
      );
    return result.recordset[0] ?? null;
  });
}

async function lookupCampaign(
  googleCampaignId: string
): Promise<CampaignLookup | null> {
  return withAdminDb(async (request) => {
    const result = await request
      .input("googleCampaignId", mssql.NVarChar, googleCampaignId)
      .execute('sp_LookupCampaignForWorker');

    if (result.recordset.length === 0) return null;

    const row = result.recordset[0];
    return {
      tenantId: row.tenant_id,
      campaignId: row.campaign_id,
      domainName: row.domain_name,
      googleCampaignId: row.google_campaign_id,
    };
  });
}

/**
 * Returns true only if the tenant has an active subscription OR is within
 * their free trial window. Everything else (expired trial, cancelled,
 * deleted) returns false and the caller should drop the event without
 * writing to the DB.
 */
async function isTenantEligible(tenantId: string): Promise<boolean> {
  return withAdminDb(async (request) => {
    const result = await request
      .input('tenantId', mssql.UniqueIdentifier, tenantId)
      .query(`
        SELECT subscription_status, trial_ends_at, deleted_at
        FROM Tenants
        WHERE tenant_id = @tenantId
      `);

    const row = result.recordset[0];
    if (!row || row.deleted_at !== null) return false;

    if (row.subscription_status === 'active') return true;

    if (row.subscription_status === 'trialing' && row.trial_ends_at) {
      return new Date(row.trial_ends_at) > new Date();
    }

    return false;
  });
}

// Look up domain_id (and tenant_id for case where campaign isn't registered)
// by domain name.
//
// KNOWN LIMITATION: Domains is RLS-protected and withAdminDb sets no tenant
// context, so this returns null on any connection that isn't already carrying
// one (see the helper comments above for why the admin bypass is dead). The
// only caller is the unregistered/domain-mismatch logging path, where a null
// result degrades logging detail but loses no tracking data — so it is left
// as-is rather than widening the blast radius of the orphan-loss fix.
// isTenantEligible has the same issue and the same reasoning.
async function lookupDomainInfo(
  domainName: string
): Promise<{ domainId: string; tenantId: string } | null> {
  return withAdminDb(async (request) => {
    const result = await request
      .input("domainName", mssql.NVarChar, domainName.substring(0, 253))
      .query(
        `SELECT TOP 1 domain_id, tenant_id FROM Domains WHERE domain_name = @domainName`
      );
    const row = result.recordset[0];
    return row ? { domainId: row.domain_id, tenantId: row.tenant_id } : null;
  });
}

async function logUnregistered(
  unrecognisedCampaignId: string,
  referringDomain: string,
  tenantId: string | null,
  domainId: string | null
): Promise<void> {
  await withAdminDb(async (request) => {
    request.input("campaignId",      mssql.NVarChar,        unrecognisedCampaignId.substring(0, 20));
    request.input("referringDomain", mssql.NVarChar,        referringDomain.substring(0, 253));
    const hasTenant = !!tenantId;
    const hasDomain = !!domainId;
    if (hasTenant)  request.input("tenantId",  mssql.UniqueIdentifier, tenantId!);
    if (hasDomain)  request.input("domainId",  mssql.UniqueIdentifier, domainId!);

    const cols = [
      "unrecognised_campaign_id",
      "referring_domain",
      ...(hasTenant ? ["tenant_id"] : []),
      ...(hasDomain ? ["domain_id"] : []),
    ].join(", ");
    const vals = [
      "@campaignId",
      "@referringDomain",
      ...(hasTenant ? ["@tenantId"] : []),
      ...(hasDomain ? ["@domainId"] : []),
    ].join(", ");

    await request.query(
      `INSERT INTO UnregisteredTrafficLog (${cols}) VALUES (${vals})`
    );
  });
}

async function ensureSession(
  tx: mssql.Transaction,
  msg: QueueMessage,
  tenantId: string,
  campaignId: string,
  googleCampaignId: string
): Promise<string | null> {
  const env = msg.envelope;
  const sessionFingerprint =
    env.payload.sessionFingerprint ?? env.payload.session?.sessionFingerprint;
  if (!sessionFingerprint) return null;

  const findResult = await new mssql.Request(tx)
    .input("fpFind", mssql.NVarChar, sessionFingerprint.substring(0, 64))
    .query(
      `SELECT TOP 1 session_id FROM Sessions
       WHERE session_fingerprint = @fpFind`
    );

  if (findResult.recordset.length > 0) {
    return findResult.recordset[0].session_id;
  }

  if (env.eventType !== "session_start") return null;
  const session = env.payload.session;
  if (!session) return null;

  const created = await new mssql.Request(tx)
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .input("campaignId", mssql.UniqueIdentifier, campaignId)
    .input("fp", mssql.NVarChar, sessionFingerprint.substring(0, 64))
    .input("keyword", mssql.NVarChar, session.keyword ?? null)
    .input("matchType", mssql.NVarChar, normaliseMatchType(session.matchType))
    .input("device", mssql.NVarChar, session.device ?? null)
    .input("gclid", mssql.NVarChar, session.gclid ?? null)
    .input("ipMasked", mssql.NVarChar, msg.ipMasked.substring(0, 20))
    .input("adGroupId", mssql.NVarChar, session.adgroupId ?? null)
    .input("adId", mssql.NVarChar, session.adId ?? null)
    .input("adPosition", mssql.NVarChar, session.adPosition ?? null)
    .input("city", mssql.NVarChar, msg.city ?? null)
    .input("country", mssql.NVarChar, msg.country ?? null)
    .query(
      `INSERT INTO Sessions
          (tenant_id, campaign_id, session_fingerprint, keyword, match_type,
           device, gclid, ip_masked, ad_group_id, ad_id, ad_position, city, country, is_bounce)
       OUTPUT INSERTED.session_id
       VALUES
          (@tenantId, @campaignId, @fp, @keyword, @matchType, @device,
           @gclid, @ipMasked, @adGroupId, @adId, @adPosition, @city, @country, 1)`
    );
  
  const sessionId = created.recordset[0]?.session_id ?? null;
  
  // Auto-cleanup: Delete old unregistered traffic logs for this campaign
  // This handles the case where user tested multiple times and earlier tests failed
  if (sessionId && googleCampaignId) {
    try {
      await new mssql.Request(tx)
        .input("gCampaignId", mssql.NVarChar, googleCampaignId.substring(0, 20))
        .query(
          `DELETE FROM UnregisteredTrafficLog
           WHERE unrecognised_campaign_id = @gCampaignId`
        );
    } catch (err) {
      // Don't fail session creation if cleanup fails - just log it
      console.warn('[ensureSession] Failed to cleanup old unregistered logs', err);
    }
  }
  
  return sessionId;
}

async function insertClickLog(
  tx: mssql.Transaction,
  msg: QueueMessage,
  tenantId: string,
  sessionId: string,
  campaignId: string
): Promise<void> {
  const env = msg.envelope;
  const session = env.payload.session;

  await new mssql.Request(tx)
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("campaignId", mssql.UniqueIdentifier, campaignId)
    .input("keyword", mssql.NVarChar, session?.keyword ?? null)
    .input("matchType", mssql.NVarChar, normaliseMatchType(session?.matchType))
    .input(
      "landingPath",
      mssql.NVarChar,
      env.payload.pagePath ?? session?.landingPath ?? null
    )
    .query(
      `INSERT INTO ClickLogs
          (tenant_id, session_id, campaign_id, keyword, match_type,
           landing_page_path)
       VALUES
          (@tenantId, @sessionId, @campaignId, @keyword, @matchType,
           @landingPath)`
    );
}

async function insertJourneyEvent(
  tx: mssql.Transaction,
  msg: QueueMessage,
  tenantId: string,
  sessionId: string,
  eventType: EventType
): Promise<void> {
  const env = msg.envelope;
  const dbEventType =
    eventType === "session_start" || eventType === "pageview" || eventType === "bfpv"
      ? "pageview"
      : eventType === "page_end"
      ? "heartbeat"
      : eventType;

  await new mssql.Request(tx)
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("eventType", mssql.NVarChar, dbEventType)
    .input("pagePath", mssql.NVarChar, env.payload.pagePath ?? null)
    .input("elementTag", mssql.NVarChar, env.payload.elementTag ?? null)
    .input("elementHref", mssql.NVarChar, env.payload.elementHref ?? null)
    .input("elementText", mssql.NVarChar(100), env.payload.elementText ?? null)
    .input("scrollPct", mssql.TinyInt, env.payload.scrollPct ?? null)
    .input("dwellMs", mssql.Int, env.payload.dwellMs ?? null)
    .input("occurredAt", mssql.DateTime2, new Date(msg.receivedAt))
    // Ordering key — captured client-side (browser Date.now()) at the moment
    // send() was called, so it reflects the visitor's true action order even
    // when two beacons race each other over the network and arrive at the
    // server out of order. occurred_at (above) stays server-authoritative
    // for what's actually displayed.
    .input("clientTs", mssql.BigInt, env.ts ?? null)
    .query(
      `INSERT INTO JourneyEvents
          (tenant_id, session_id, event_type, page_path, element_tag,
           element_href, element_text, scroll_depth_pct, dwell_time_ms, occurred_at, client_ts)
       VALUES
          (@tenantId, @sessionId, @eventType, @pagePath, @elementTag,
           @elementHref, @elementText, @scrollPct, @dwellMs, @occurredAt, @clientTs)`
    );
}

async function updateSessionDwell(
  tx: mssql.Transaction,
  sessionId: string,
  dwellMs: number,
  scrollPct?: number | null,
  isPageEnd?: boolean
): Promise<void> {
  const dwellClamped = Math.min(dwellMs, 86_400_000);

  await new mssql.Request(tx)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("dwellMs", mssql.Int, dwellClamped)
    .input("scrollPct", mssql.TinyInt, scrollPct ?? null)
    .query(
      isPageEnd
        ? // page_end: this page is genuinely over — its dwell is final, so
          // permanently bank it into completed_pages_duration_ms rather than
          // just overwriting total_duration_ms with this one page's number.
          //
          // total_duration_ms is only ever allowed to grow. Beacons do go
          // missing in transit, and when a page_end is lost, everything its
          // heartbeats had already reported for that page would otherwise be
          // wiped out by the NEXT page's page_end (which computes from a
          // completed_pages_duration_ms that never received the lost value).
          // That's how a real 17-second visit ended up displaying as 308ms.
          // Session time can't actually go backwards, so refuse to write a
          // smaller number than we've already established.
          //
          // is_bounce is checked against the SESSION-WIDE running total, not
          // this one page's dwell in isolation — otherwise a visitor who
          // revisits the same/another page more than once (each stretch
          // individually under 5s) would incorrectly stay flagged as a bounce
          // even when their combined time on site is well past that threshold.
          `UPDATE Sessions
             SET completed_pages_duration_ms = completed_pages_duration_ms + @dwellMs,
                 total_duration_ms = CASE
                   WHEN (completed_pages_duration_ms + @dwellMs) > ISNULL(total_duration_ms, 0)
                     THEN completed_pages_duration_ms + @dwellMs
                   ELSE total_duration_ms
                 END,
                 is_bounce = CASE
                   WHEN (CASE
                           WHEN (completed_pages_duration_ms + @dwellMs) > ISNULL(total_duration_ms, 0)
                             THEN completed_pages_duration_ms + @dwellMs
                           ELSE total_duration_ms
                         END) < 5000 AND NOT EXISTS (
                     SELECT 1 FROM JourneyEvents
                     WHERE session_id = @sessionId
                       AND event_type IN ('click', 'success_event')
                   ) THEN 1
                   ELSE 0
                 END,
                 max_scroll_pct = CASE
                   WHEN @scrollPct IS NOT NULL AND (max_scroll_pct IS NULL OR @scrollPct > max_scroll_pct)
                     THEN @scrollPct
                   ELSE max_scroll_pct
                 END
           WHERE session_id = @sessionId`
        : // heartbeat: the page is still open — this is a live, not-yet-final
          // number, so it's recomputed on top of the locked-in base without
          // touching completed_pages_duration_ms itself. Same monotonic guard
          // and same cumulative-total bounce check as page_end, for the same
          // reasons described above.
          `UPDATE Sessions
             SET total_duration_ms = CASE
                   WHEN (ISNULL(completed_pages_duration_ms, 0) + @dwellMs) > ISNULL(total_duration_ms, 0)
                     THEN ISNULL(completed_pages_duration_ms, 0) + @dwellMs
                   ELSE total_duration_ms
                 END,
                 is_bounce = CASE
                   WHEN (CASE
                           WHEN (ISNULL(completed_pages_duration_ms, 0) + @dwellMs) > ISNULL(total_duration_ms, 0)
                             THEN ISNULL(completed_pages_duration_ms, 0) + @dwellMs
                           ELSE total_duration_ms
                         END) < 5000 AND NOT EXISTS (
                     SELECT 1 FROM JourneyEvents
                     WHERE session_id = @sessionId
                       AND event_type IN ('click', 'success_event')
                   ) THEN 1
                   ELSE 0
                 END,
                 max_scroll_pct = CASE
                   WHEN @scrollPct IS NOT NULL AND (max_scroll_pct IS NULL OR @scrollPct > max_scroll_pct)
                     THEN @scrollPct
                   ELSE max_scroll_pct
                 END
           WHERE session_id = @sessionId`
    );
}

export async function queueWorkerHandler(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const validation = QueueMessageSchema.safeParse(queueItem);
  if (!validation.success) {
    context.error("[Worker] Invalid queue message — discarding", {
      issues: validation.error.issues.length,
    });
    return;
  }

  const msg = validation.data;
  const env = msg.envelope;
  const googleCampaignId = env.payload.session?.campaignId ?? "";

  if (!googleCampaignId && env.eventType === "session_start") {
    context.log("[Worker] No campaign ID in session_start — discarding", {
      domain: env.domain,
    });
    return;
  }

  let campaign: CampaignLookup | null = null;

  if (googleCampaignId) {
    campaign = await lookupCampaign(googleCampaignId);
    if (!campaign) {
      context.log("[Worker] Unregistered campaign — logging", {
        campaignId: googleCampaignId,
        domain: env.domain,
      });
      try {
        const domainInfo = await lookupDomainInfo(env.domain);
        await logUnregistered(googleCampaignId, env.domain, domainInfo?.tenantId ?? null, domainInfo?.domainId ?? null);
      } catch (err) {
        context.error("[Worker] Failed to log unregistered traffic", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (normaliseDomain(env.domain) !== normaliseDomain(campaign.domainName)) {
      context.log("[Worker] Domain mismatch — logging", {
        campaignId: googleCampaignId,
        sentDomain: env.domain,
        registeredDomain: campaign.domainName,
      });
      try {
        const domainInfo = await lookupDomainInfo(env.domain);
        await logUnregistered(googleCampaignId, env.domain, campaign.tenantId, domainInfo?.domainId ?? null);
      } catch (err) {
        context.error("[Worker] Failed to log domain mismatch", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    // Gate: only write data for tenants on an active subscription or within
    // their free trial. Expired, cancelled, and deleted tenants are dropped
    // silently — no DB writes, no queue poison, no error.
    const eligible = await isTenantEligible(campaign.tenantId);
    if (!eligible) {
      context.log("[Worker] Tenant not eligible — dropping event", {
        tenantId: campaign.tenantId,
        eventType: env.eventType,
      });
      return;
    }
  }

  if (!campaign) {
    const fp =
      env.payload.sessionFingerprint ??
      env.payload.session?.sessionFingerprint;
    if (!fp) return;

    // Resolve the tenant from the domain first — without it the Sessions read
    // below is filtered to zero rows by RLS (see helper comments above).
    const tenantId = await lookupTenantByDomain(env.domain);
    if (!tenantId) {
      // No registered campaign owns this domain, so there is no tenant this
      // event could ever belong to. Retrying would never succeed — drop it.
      context.log(`[Worker] Unregistered domain for ${env.eventType} — dropping`, {
        domain: env.domain,
        eventType: env.eventType,
      });
      return;
    }

    let sessionInfo = await findSessionByFingerprint(tenantId, fp);

    if (!sessionInfo) {
      // session_start may still be in-flight through the queue. Poll briefly
      // in-process to catch the common case cheaply.
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        sessionInfo = await findSessionByFingerprint(tenantId, fp);
        if (sessionInfo) break;
      }
      if (!sessionInfo) {
        // Throw rather than return: the session may simply not have committed
        // yet (session_start transactions have been observed taking 6s+ during
        // cold starts, longer than this poll). Throwing lets Azure redeliver
        // the message so a slow commit becomes a delayed write instead of
        // permanent loss. If it truly can never be placed, it lands in the
        // poison queue where it is visible — unlike the silent drop this
        // replaces, which lost data on ~14% of sessions with no error anywhere.
        context.warn(
          `[Worker] Orphan ${env.eventType} — no session yet, will retry`,
          { domain: env.domain, eventType: env.eventType, fp: fp.substring(0, 24) }
        );
        throw new Error(`Orphan ${env.eventType} — session not found`);
      }
    }

    campaign = {
      tenantId: sessionInfo.tenant_id,
      campaignId: sessionInfo.campaign_id,
      domainName: env.domain,
      googleCampaignId: googleCampaignId,
    };
  }

  // For non-session_start events, poll outside the transaction to avoid holding
  // an open DB connection for up to 3s while waiting for session_start to commit.
  if (env.eventType !== "session_start") {
    const fp = env.payload.sessionFingerprint ?? env.payload.session?.sessionFingerprint;
    if (fp) {
      let sessionExists = false;
      for (let attempt = 0; attempt <= 6; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 500));
        // campaign.tenantId is known by this point (either from the campaign
        // lookup above or from the session lookup), so the context can be set
        // directly — no domain resolution needed here.
        const found = await findSessionByFingerprint(campaign.tenantId, fp);
        if (found) { sessionExists = true; break; }
      }
      if (!sessionExists) {
        context.warn(
          `[Worker] Orphan ${env.eventType} — no session yet, will retry`,
          { domain: env.domain, eventType: env.eventType, fp: fp.substring(0, 24) }
        );
        throw new Error(`Orphan ${env.eventType} — session not found`);
      }
    }
  }

  try {
    await withTenantDb(campaign.tenantId, async (tx) => {
      const sessionId = await ensureSession(
        tx,
        msg,
        campaign!.tenantId,
        campaign!.campaignId,
        campaign!.googleCampaignId
      );
      if (!sessionId) {
        if (env.eventType === "session_start") {
          context.log("[Worker] Could not create session — missing payload, skipping");
          return;
        }
        // Pre-check above guarantees session exists by this point.
        // If we still get null here, the payload is genuinely malformed.
        context.warn(`[Worker] ensureSession returned null for ${env.eventType} despite pre-check — skipping`);
        return;
      }

      switch (env.eventType) {
        case "session_start":
          await insertClickLog(
            tx,
            msg,
            campaign!.tenantId,
            sessionId,
            campaign!.campaignId
          );
          await insertJourneyEvent(
            tx,
            msg,
            campaign!.tenantId,
            sessionId,
            "session_start"
          );
          await new mssql.Request(tx)
            .input("campaignId", mssql.UniqueIdentifier, campaign!.campaignId)
            .query(
              `UPDATE Campaigns SET status = 'active'
               WHERE campaign_id = @campaignId
                 AND status = 'awaiting_data'`
            );
          break;
        case "form_interact":
          await insertJourneyEvent(tx, msg, campaign!.tenantId, sessionId, env.eventType);
          await new mssql.Request(tx)
            .input("sessionId", mssql.UniqueIdentifier, sessionId)
            .query(`UPDATE Sessions SET is_bounce = 0 WHERE session_id = @sessionId AND is_bounce = 1`);
          break;
        case "pageview":
        case "bfpv":
        case "click":
        case "success_event":
        case "heartbeat":
          // The standalone "pageview" event races against session_start's own
          // pageview insert (both fire ~simultaneously on page load). If this
          // message is processed before session_start commits, ensureSession
          // throws above and Azure retries ~30s later — by which time
          // session_start's pageview row already exists, so this would create
          // a duplicate "Visited <page>" entry with a misleading later
          // timestamp. Skip the insert if that row is already there.
          if (env.eventType === "pageview") {
            const existingPageview = await new mssql.Request(tx)
              .input("sessionId", mssql.UniqueIdentifier, sessionId)
              .input("pagePath", mssql.NVarChar, env.payload.pagePath ?? null)
              .query(
                `SELECT TOP 1 1 FROM JourneyEvents
                 WHERE session_id = @sessionId AND event_type = 'pageview'
                   AND page_path = @pagePath`
              );
            if (existingPageview.recordset.length > 0) break;
          }
          await insertJourneyEvent(
            tx,
            msg,
            campaign!.tenantId,
            sessionId,
            env.eventType
          );
          if (env.eventType === "click" || env.eventType === "success_event") {
            await new mssql.Request(tx)
              .input("sessionId", mssql.UniqueIdentifier, sessionId)
              .query(`UPDATE Sessions SET is_bounce = 0 WHERE session_id = @sessionId AND is_bounce = 1`);
          }
          if (env.eventType === "pageview" && isThankYouPage(env.payload.pagePath)) {
            await insertJourneyEvent(tx, msg, campaign!.tenantId, sessionId, "success_event");
            await new mssql.Request(tx)
              .input("sessionId", mssql.UniqueIdentifier, sessionId)
              .query(`UPDATE Sessions SET is_bounce = 0 WHERE session_id = @sessionId AND is_bounce = 1`);
          }
          if (env.eventType === "heartbeat" && env.payload.dwellMs) {
            await updateSessionDwell(tx, sessionId, env.payload.dwellMs, env.payload.scrollPct, false);
          }
          break;
        case "page_end":
          if (env.payload.dwellMs) {
            await updateSessionDwell(tx, sessionId, env.payload.dwellMs, env.payload.scrollPct, true);
          }
          break;
      }
    });
  } catch (err) {
    context.error("[Worker] DB write failed — will retry", {
      err: err instanceof Error ? err.message : String(err),
      eventType: env.eventType,
    });
    throw err;
  }
}

app.storageQueue("queue-worker", {
  queueName: process.env.QUEUE_NAME ?? "clicklog-ingest",
  connection: "QUEUE_CONNECTION",
  handler: queueWorkerHandler,
});