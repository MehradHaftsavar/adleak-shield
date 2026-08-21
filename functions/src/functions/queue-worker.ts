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
import { hashVisitor } from "../lib/ip-mask.js";
import { getTodaySalt } from "../lib/salt.js";

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

// A visit is considered still open for this long after its last event. Used by
// every referrer/hash match so a stale session from hours ago can never absorb
// a new visitor's events.
// MUST STAY EQUAL TO INACTIVITY_WINDOW_MS in src/lib/sessionRules.ts.
// This decides whether an arriving event may still join a session; the
// dashboard uses the same number to decide whether a journey may still gain
// steps. If they disagree the UI contradicts itself — "Visit ended" with a
// later step printed underneath it. Separate deploy units, so no shared
// import is possible; this comment is the link.
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

interface SessionMatch {
  sessionId: string;
  tenantId: string;
  campaignId: string;
  /** Only used to measure how late a session was created. See probeGraceMiss. */
  startedAt: Date;
}

/**
 * Pull a gclid out of a referrer URL.
 *
 * This is what carries attribution past the landing page. When someone clicks
 * from the ad landing page to a second page, the browser passes the full
 * previous URL — including ?gclid=... — as the referrer. Same-origin
 * navigation preserves the query string in every major browser (Safari
 * included; ITP only downgrades CROSS-site referrers), so this is a reliable
 * link back to the click, and unlike the IP it does not change mid-visit.
 */
function gclidFromReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const value = new URL(referrer).searchParams.get("gclid");
    return value ? value.substring(0, 100) : null;
  } catch {
    return null;
  }
}

/**
 * Path portion of a referrer, but ONLY when the referrer is same-site.
 *
 * The host check is essential. A visitor arriving from a Google ad carries
 * `document.referrer = "https://www.google.com/"`, whose path is "/" — and
 * matching that against sessions sitting on "/" would attach one visitor's
 * events to a different visitor's journey. The referrer is only evidence of
 * continuity when it points at a page on the SAME site.
 */
function samSitePathFromUrl(
  url: string | null | undefined,
  domain: string
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (normaliseDomain(parsed.host) !== normaliseDomain(domain)) return null;
    return parsed.pathname.substring(0, 500);
  } catch {
    return null;
  }
}

/**
 * Find the session an event belongs to.
 *
 * Ordered most-certain first. Each step is independent of the others, which is
 * the point: gclid survives an IP change, the referrer survives an IP change,
 * and the hash survives a missing referrer. A visit has to lose all of them
 * before it becomes unattributable.
 */
/**
 * How far after an event arrived a session may still have been created and
 * legitimately own it.
 *
 * The only reason this is not zero is the queue-ordering race: a page's beacons
 * can be processed before the session_start beside them commits, and if that
 * session_start is itself retried (30s visibility timeout, up to 5 attempts)
 * the Sessions row can appear a couple of minutes after the events that belong
 * to it. Five minutes covers that comfortably.
 *
 * It is deliberately not larger. Every millisecond of slack here is a window in
 * which one visitor's parked events can be adopted by a different visitor's
 * later session, which is exactly the corruption this guard exists to stop.
 */
const SESSION_CREATION_GRACE_MS = 5 * 60 * 1000;

async function matchSession(
  tenantId: string,
  domain: string,
  gclid: string | null,
  referrer: string | null | undefined,
  visitorHash: string | null | undefined,
  eventAt: Date,
  graceMs: number = SESSION_CREATION_GRACE_MS
): Promise<SessionMatch | null> {
  const referrerGclid = gclidFromReferrer(referrer);
  const referrerPath = samSitePathFromUrl(referrer, domain);

  // Both bounds are anchored to WHEN THE EVENT ARRIVED, not to now.
  //
  // These used to be derived from Date.now(), which is the same thing for a
  // live event and catastrophically wrong for a parked one: the reconciler
  // retries for 24 hours, so an event from 08:42 was being compared against a
  // window centred on 10:48 and cheerfully adopted by whichever session was
  // active then. Three sessions on 17 Aug each ended up owning a slice of one
  // 08:42 burst, producing 70-minute and 2-hour "visits" with a single gap in
  // the middle, and journeys whose first step predated their own landing.
  //
  // msg.receivedAt is the server clock at ingest and is preserved when an event
  // is parked, so it stays correct across reconciliation — and it is directly
  // comparable to started_at / last_event_at without any browser-clock skew.
  const cutoff = new Date(eventAt.getTime() - ACTIVE_WINDOW_MS);
  const maxStart = new Date(eventAt.getTime() + graceMs);

  return withAdminDb(async (request) => {
    const result = await request
      .input("tid", mssql.UniqueIdentifier, tenantId)
      .input("gclid", mssql.NVarChar(100), gclid ?? referrerGclid ?? null)
      .input("refPath", mssql.NVarChar(500), referrerPath)
      .input("vhash", mssql.NVarChar(64), visitorHash ?? null)
      .input("cutoff", mssql.DateTime2, cutoff)
      .input("maxStart", mssql.DateTime2, maxStart)
      .query(`
        SET NOCOUNT ON;
        DECLARE @t VARBINARY(128) = CAST(@tid AS VARBINARY(128));
        EXEC sp_set_session_context N'TenantId', @t, @read_only = 0;

        -- Deliberately ONE select rather than three sequential ones. node-mssql
        -- exposes result.recordset as the FIRST result set, so a query that
        -- returned an empty set followed by a populated one would look like a
        -- miss. Priority is expressed in the ORDER BY instead.
        SELECT TOP 1 session_id, tenant_id, campaign_id, started_at
        FROM (
          -- 1. gclid, from the current URL or recovered from the referrer.
          --    Unique per ad click, so this is exact.
          --    Bounded by the same 30-minute inactivity window as the other
          --    two branches. It previously had none, and a gclid persists in
          --    the referrer chain for as long as the visitor stays on the site,
          --    so a visit that went quiet for an hour and resumed was folded
          --    back into the original session — one journey with a 61-minute
          --    hole in the middle reading "103m 40s total". Thirty minutes of
          --    silence ends a visit by any normal definition.
          SELECT session_id, tenant_id, campaign_id, started_at,
                 1 AS priority, started_at AS recency
          FROM Sessions
          WHERE @gclid IS NOT NULL AND gclid = @gclid
            AND started_at <= @maxStart
            AND (last_event_at IS NULL OR last_event_at >= @cutoff)

          UNION ALL

          -- 2. The referrer names the page a session is currently sitting on.
          --    Survives an IP change: it describes the page, not the network.
          SELECT session_id, tenant_id, campaign_id, started_at,
                 2 AS priority, last_event_at AS recency
          FROM Sessions
          WHERE @refPath IS NOT NULL
            AND last_page_path = @refPath
            AND last_event_at >= @cutoff
            AND started_at <= @maxStart

          UNION ALL

          -- 3. Server-derived visitor hash. Most recent wins, so a second ad
          --    click from the same person attaches to their newer session.
          SELECT session_id, tenant_id, campaign_id, started_at,
                 3 AS priority, last_event_at AS recency
          FROM Sessions
          WHERE @vhash IS NOT NULL
            AND session_fingerprint = @vhash
            AND last_event_at >= @cutoff
            AND started_at <= @maxStart
        ) candidates
        ORDER BY priority ASC, recency DESC;
      `);

    const row = result.recordset?.[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      tenantId: row.tenant_id,
      campaignId: row.campaign_id,
      startedAt: new Date(row.started_at),
    };
  });
}

/**
 * Instrumentation only — never changes what we store.
 *
 * SESSION_CREATION_GRACE_MS is the one threshold in this file picked by
 * reasoning rather than measurement, and getting it wrong in the tight
 * direction silently orphans a page's events. This re-runs the match with a
 * deliberately wide grace on the rare path where a real ad-visitor event could
 * not be placed, so the logs tell us whether the grace was the only thing in
 * the way — and by how much it missed.
 *
 * Deliberately NOT called for organic traffic (that path returns earlier), so
 * this costs one extra query on a low-volume path only. If these lines appear
 * in volume with deltas above five minutes, the grace is too tight and should
 * be raised to whatever the observed distribution demands. If they never
 * appear, five minutes is comfortably right and this can be deleted.
 */
async function probeGraceMiss(
  context: InvocationContext,
  tenantId: string,
  env: QueueMessage["envelope"],
  visitorHash: string | null | undefined,
  eventAt: Date
): Promise<void> {
  try {
    const relaxed = await matchSession(
      tenantId,
      env.domain,
      env.payload.session?.gclid ?? null,
      env.payload.referrer,
      visitorHash,
      eventAt,
      60 * 60 * 1000 // an hour — wide enough to reveal the real distribution
    );
    if (!relaxed) return;

    // Only report a genuine grace miss. A relaxed match also succeeds when the
    // session simply committed between the earlier attempts and this one — a
    // race that resolves itself, where the event is parked and the reconciler
    // attaches it minutes later with nothing lost. Observed 18 Aug: a session
    // created 3.6s after its event tripped this and looked alarming, when the
    // 5-minute grace had not been the obstacle at all.
    const createdAfterMs = relaxed.startedAt.getTime() - eventAt.getTime();
    if (createdAfterMs <= SESSION_CREATION_GRACE_MS) return;

    context.warn("[Worker] GRACE-MISS — matched only with a wider creation grace", {
      eventType: env.eventType,
      sessionCreatedAfterEventMs: createdAfterMs,
      currentGraceMs: SESSION_CREATION_GRACE_MS,
      sessionId: relaxed.sessionId,
    });
  } catch {
    // Diagnostics must never affect ingestion.
  }
}

/**
 * Does this domain have any visit open right now? Cheap organic-traffic guard.
 *
 * Both columns are checked deliberately. last_event_at is only written by
 * touchSession, so it is NULL on a session that has just been created and on
 * every session predating that column — and NULL >= @cutoff is never true, so
 * checking it alone would call a live ad visit "idle". Erring wide here is
 * free: the worst case is that an organic event gets parked and the reconciler
 * discards it a few minutes later. Erring narrow loses a real event forever.
 */
async function domainHasActiveSession(tenantId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);
  return withAdminDb(async (request) => {
    const result = await request
      .input("tid", mssql.UniqueIdentifier, tenantId)
      .input("cutoff", mssql.DateTime2, cutoff)
      .query(`
        SET NOCOUNT ON;
        DECLARE @t VARBINARY(128) = CAST(@tid AS VARBINARY(128));
        EXEC sp_set_session_context N'TenantId', @t, @read_only = 0;
        SELECT TOP 1 1 FROM Sessions
         WHERE last_event_at >= @cutoff OR started_at >= @cutoff;
      `);
    return result.recordset.length > 0;
  });
}

/**
 * Park an event we could not place yet.
 *
 * Almost always this is a queue-ordering race — with batchSize 16 the worker
 * processes messages concurrently, so page 2 can genuinely arrive before page
 * 1 has committed. The reconciler retries a few minutes later with the full
 * picture. Nothing is ever discarded here; that silent drop is exactly what
 * cost us data before.
 */
async function parkPendingEvent(
  msg: QueueMessage,
  visitorHash: string | null | undefined
): Promise<void> {
  const env = msg.envelope;
  await withAdminDb(async (request) => {
    await request
      .input("domain", mssql.NVarChar(253), env.domain.substring(0, 253))
      .input("vhash", mssql.NVarChar(64), visitorHash ?? null)
      .input("referrer", mssql.NVarChar(500), env.payload.referrer ?? null)
      .input("pagePath", mssql.NVarChar(500), env.payload.pagePath ?? null)
      .input("eventType", mssql.NVarChar(30), env.eventType)
      .input("payload", mssql.NVarChar(mssql.MAX), JSON.stringify(msg))
      .input("clientTs", mssql.BigInt, env.ts ?? null)
      .input("occurredAt", mssql.DateTime2, new Date(msg.receivedAt))
      .query(`
        INSERT INTO PendingEvents
          (domain, visitor_hash, referrer, page_path, event_type,
           payload_json, client_ts, occurred_at)
        VALUES
          (@domain, @vhash, @referrer, @pagePath, @eventType,
           @payload, @clientTs, @occurredAt)
      `);
  });
}

/** Record where a session currently is, so the next page's referrer can find it. */
async function touchSession(
  tx: mssql.Transaction,
  sessionId: string,
  pagePath: string | null | undefined
): Promise<void> {
  await new mssql.Request(tx)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("pagePath", mssql.NVarChar(500), pagePath ?? null)
    .query(`
      UPDATE Sessions
         SET last_event_at  = SYSUTCDATETIME(),
             last_page_path = COALESCE(@pagePath, last_page_path)
       WHERE session_id = @sessionId
    `);
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
  googleCampaignId: string,
  matchedSessionId: string | null
): Promise<string | null> {
  const env = msg.envelope;

  // The match ladder already identified the session for every event except a
  // brand-new landing. Use its answer rather than looking up again.
  if (matchedSessionId) return matchedSessionId;

  if (env.eventType !== "session_start") return null;
  const session = env.payload.session;
  if (!session) return null;

  // Sessions are keyed by gclid, NOT by the visitor hash.
  //
  // The hash is derived from IP + User-Agent, so a person who clicks the same
  // ad twice produces the identical hash both times. Keying on it would fold
  // their second click into the first session — two billed clicks showing as
  // one visit, and broken refund evidence. gclid is unique per click, so this
  // both separates genuine repeat clicks AND makes redelivery of the same
  // session_start idempotent.
  if (session.gclid) {
    const existing = await new mssql.Request(tx)
      .input("gclidFind", mssql.NVarChar(100), session.gclid.substring(0, 100))
      .query(
        `SELECT TOP 1 session_id FROM Sessions WHERE gclid = @gclidFind`
      );
    if (existing.recordset.length > 0) {
      return existing.recordset[0].session_id;
    }
  }

  // session_fingerprint now stores the SERVER-derived visitor hash. Falls back
  // to the client value only for events from browsers still running a cached
  // copy of the old tracker.
  const visitorKey =
    msg.visitorHash ??
    env.payload.sessionFingerprint ??
    session.sessionFingerprint ??
    null;
  if (!visitorKey) return null;

  const created = await new mssql.Request(tx)
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .input("campaignId", mssql.UniqueIdentifier, campaignId)
    .input("fp", mssql.NVarChar, visitorKey.substring(0, 64))
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
    // Only heartbeat/page_end rows describe a span of time, and the timeline
    // renders a "… dwell" label off this column. success_event now carries
    // dwellMs too, but purely so the session total can be banked at the moment
    // of conversion — writing it onto the click row would put a stray dwell
    // label on that step. Behaviour is unchanged for every pre-existing type:
    // none of pageview/bfpv/click/form_interact ever sends dwellMs.
    //
    // tab_return reuses this column for a different quantity: how long the
    // visitor was AWAY. No schema change needed, and the timeline reads it by
    // event type rather than assuming every value here means dwell.
    .input(
      "dwellMs",
      mssql.Int,
      dbEventType === "heartbeat"
        ? env.payload.dwellMs ?? null
        : dbEventType === "tab_return"
        ? env.payload.awayMs ?? null
        : null
    )
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

/**
 * Close out the page the visitor just left, and record which page they are on.
 *
 * Heartbeats only ever raise total_duration_ms; nothing lands in
 * completed_pages_duration_ms until that page's page_end arrives. So when a
 * page_end goes missing — and they do, that is the whole reason the monotonic
 * guard exists — the next page starts counting from a base of zero, and every
 * second it accumulates is invisible until it passes the previous page's
 * high-water mark. A real visit of 65s + 19s across two pages displayed as
 * 59s: page one's heartbeats had reached 60s, and page two never beat it.
 *
 * Arriving on a new page proves the previous one is finished, so whatever
 * total_duration_ms had reached is now settled — bank it. If that page's
 * page_end does turn up later it adds nothing new, because
 * current_page_ts has moved past it (see updateSessionDwell).
 *
 * The WHERE clause makes this a no-op for a duplicate or out-of-order pageview:
 * only a beacon newer than the page we are already tracking can advance it.
 */
async function bankPreviousPage(
  tx: mssql.Transaction,
  sessionId: string,
  clientTs: number | null
): Promise<void> {
  if (clientTs == null) return;

  await new mssql.Request(tx)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("clientTs", mssql.BigInt, clientTs)
    .query(
      `UPDATE Sessions
          SET completed_pages_duration_ms = CASE
                WHEN ISNULL(total_duration_ms, 0) > ISNULL(completed_pages_duration_ms, 0)
                  THEN ISNULL(total_duration_ms, 0)
                ELSE ISNULL(completed_pages_duration_ms, 0)
              END,
              current_page_ts = @clientTs
        WHERE session_id = @sessionId
          AND @clientTs > ISNULL(current_page_ts, 0)`
    );
}

async function updateSessionDwell(
  tx: mssql.Transaction,
  sessionId: string,
  dwellMs: number,
  scrollPct?: number | null,
  isPageEnd?: boolean,
  clientTs?: number | null
): Promise<void> {
  const dwellClamped = Math.min(dwellMs, 86_400_000);

  await new mssql.Request(tx)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("dwellMs", mssql.Int, dwellClamped)
    .input("scrollPct", mssql.TinyInt, scrollPct ?? null)
    .input("clientTs", mssql.BigInt, clientTs ?? null)
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
          //
          // "Did anything happen" here must match has_interaction in the
          // dashboard (src/app/api/sessions/route.ts and the journey route),
          // including the 25% scroll floor from MEANINGFUL_SCROLL_PCT in
          // src/lib/sessionRules.ts. They are separate deploy units so the
          // number cannot be shared; keep them equal by hand.
          //
          // form_interact used to be missing from this list. Its own case in
          // the switch clears is_bounce when it arrives, but this recomputation
          // ran on the next heartbeat and set the flag straight back — so a
          // visitor who typed into a form and left inside five seconds was
          // filed as a bounce, with the record of their typing sitting right
          // there in the same session.
          //
          // The dwell is only added when this page_end still belongs to the
          // page the session is on. bankPreviousPage has already settled this
          // page's time if the visitor moved on first, and the queue delivers
          // these two concurrently — without the guard, whichever order they
          // land in would count the same stretch twice. Comparing client
          // clocks is what makes it order-independent: a page_end always
          // predates the next page's load, so a page_end older than
          // current_page_ts is one whose page is already banked.
          `UPDATE s
             SET completed_pages_duration_ms = x.newCompleted,
                 total_duration_ms = CASE
                   WHEN x.newCompleted > ISNULL(s.total_duration_ms, 0)
                     THEN x.newCompleted
                   ELSE s.total_duration_ms
                 END,
                 is_bounce = CASE
                   WHEN (CASE
                           WHEN x.newCompleted > ISNULL(s.total_duration_ms, 0)
                             THEN x.newCompleted
                           ELSE s.total_duration_ms
                         END) < 5000 AND NOT EXISTS (
                     SELECT 1 FROM JourneyEvents
                     WHERE session_id = @sessionId
                       AND event_type IN ('click', 'success_event', 'form_interact')
                   )
                   AND ISNULL(s.max_scroll_pct, 0) < 25
                   AND ISNULL(@scrollPct, 0) < 25
                     THEN 1
                   ELSE 0
                 END,
                 max_scroll_pct = CASE
                   WHEN @scrollPct IS NOT NULL AND (s.max_scroll_pct IS NULL OR @scrollPct > s.max_scroll_pct)
                     THEN @scrollPct
                   ELSE s.max_scroll_pct
                 END,
                 -- Moving the marker to this page_end is what makes the write
                 -- idempotent. Azure Storage Queues are at-least-once: if the
                 -- DB commit succeeds but the message is not deleted (host
                 -- restart, visibility timeout), it comes back and is processed
                 -- again. A redelivered page_end would otherwise add its dwell
                 -- a second time — 84s of real activity became 149s.
                 current_page_ts = CASE
                   WHEN @clientTs IS NOT NULL AND @clientTs > ISNULL(s.current_page_ts, 0)
                     THEN @clientTs
                   ELSE s.current_page_ts
                 END
             FROM Sessions s
             CROSS APPLY (
               SELECT newCompleted = ISNULL(s.completed_pages_duration_ms, 0) +
                 CASE
                   WHEN @clientTs IS NULL OR @clientTs > ISNULL(s.current_page_ts, 0)
                     THEN @dwellMs
                   ELSE 0
                 END
             ) x
            WHERE s.session_id = @sessionId`
        : // heartbeat: the page is still open — this is a live, not-yet-final
          // number, so it's recomputed on top of the locked-in base without
          // touching completed_pages_duration_ms itself. Same monotonic guard
          // and same cumulative-total bounce check as page_end, for the same
          // reasons described above.
          //
          // Stale beacons are ignored for the same reason page_end guards
          // itself. dwellMs is measured from ITS OWN page's load, so once that
          // page has been banked into completed_pages_duration_ms, adding it to
          // that base again counts the same stretch twice. A heartbeat older
          // than current_page_ts belongs to a page that is already settled.
          `UPDATE s
             SET total_duration_ms = x.newTotal,
                 is_bounce = CASE
                   WHEN x.newTotal < 5000 AND NOT EXISTS (
                     SELECT 1 FROM JourneyEvents
                     WHERE session_id = @sessionId
                       AND event_type IN ('click', 'success_event', 'form_interact')
                   )
                   AND ISNULL(s.max_scroll_pct, 0) < 25
                   AND ISNULL(@scrollPct, 0) < 25
                     THEN 1
                   ELSE 0
                 END,
                 max_scroll_pct = CASE
                   WHEN @scrollPct IS NOT NULL AND (s.max_scroll_pct IS NULL OR @scrollPct > s.max_scroll_pct)
                     THEN @scrollPct
                   ELSE s.max_scroll_pct
                 END
             FROM Sessions s
             CROSS APPLY (
               SELECT newTotal = CASE
                 WHEN (@clientTs IS NULL OR @clientTs > ISNULL(s.current_page_ts, 0))
                      AND (ISNULL(s.completed_pages_duration_ms, 0) + @dwellMs) > ISNULL(s.total_duration_ms, 0)
                   THEN ISNULL(s.completed_pages_duration_ms, 0) + @dwellMs
                 ELSE s.total_duration_ms
               END
             ) x
            WHERE s.session_id = @sessionId`
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

  await processMessage(validation.data, context, true);
}

/**
 * Second attempt at an event the worker had to park.
 *
 * Same code path as live processing — the only difference is that a miss here
 * returns false instead of parking the event again. Returns true once the
 * event has been written.
 */
export async function attachPendingEvent(
  msg: QueueMessage,
  context: InvocationContext
): Promise<boolean> {
  return processMessage(msg, context, false);
}

/**
 * Handle one event end to end. Returns true if it was written (or deliberately
 * discarded as organic/ineligible), false if it could not be placed and the
 * caller should decide what to do next.
 */
async function processMessage(
  msg: QueueMessage,
  context: InvocationContext,
  allowPark: boolean
): Promise<boolean> {
  const env = msg.envelope;
  const googleCampaignId = env.payload.session?.campaignId ?? "";

  // Normally ingest has already hashed the visitor, so the raw IP never left
  // that function. It only sends ipRaw when the salt table was unreachable —
  // in that case we finish the job here rather than lose the event.
  let visitorHash: string | undefined = msg.visitorHash;
  if (!visitorHash && msg.ipRaw) {
    try {
      const salt = await getTodaySalt();
      visitorHash = hashVisitor(salt, env.domain, msg.ipRaw, msg.userAgent);
    } catch (err) {
      context.warn("[Worker] Could not derive visitor hash", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Cached copies of the old tracker still send a client-generated fingerprint.
  // Remove this fallback once they have aged out (~2 weeks after deploy).
  if (!visitorHash) {
    visitorHash =
      env.payload.sessionFingerprint ?? env.payload.session?.sessionFingerprint;
  }

  if (!googleCampaignId && env.eventType === "session_start") {
    context.log("[Worker] No campaign ID in session_start — discarding", {
      domain: env.domain,
    });
    return true;
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
      return true;
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
      return true;
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
      return true;
    }
  }

  let matchedSessionId: string | null = null;

  if (!campaign) {
    // Every event after the landing page arrives without a campaign ID, so the
    // tenant has to come from the domain first — a Sessions read with no tenant
    // context is filtered to zero rows by RLS (see the helper comments above).
    const tenantId = await lookupTenantByDomain(env.domain);
    if (!tenantId) {
      // No registered campaign owns this domain, so no tenant could ever own
      // this event. Retrying would never succeed.
      context.log(`[Worker] Unregistered domain for ${env.eventType} — dropping`, {
        domain: env.domain,
        eventType: env.eventType,
      });
      return true;
    }

    let match = await matchSession(
      tenantId,
      env.domain,
      env.payload.session?.gclid ?? null,
      env.payload.referrer,
      visitorHash,
      new Date(msg.receivedAt)
    );

    // One short retry absorbs the common queue-ordering race (batchSize is 16,
    // so page 2 can genuinely be processed before page 1 has committed) without
    // the 3-second stall the old poll imposed on every event.
    if (!match) {
      await new Promise(r => setTimeout(r, 750));
      match = await matchSession(
        tenantId,
        env.domain,
        env.payload.session?.gclid ?? null,
        env.payload.referrer,
        visitorHash,
        new Date(msg.receivedAt)
      );
    }

    if (!match) {
      // Live processing parks it for the reconciler to retry. Nothing is
      // discarded — silently dropping these is what cost us data on ~14% of
      // sessions before. When the reconciler itself is the caller, report the
      // miss instead so the row stays pending for the next pass.
      if (!allowPark) return false;

      // The tracker now fires on every page for every visitor, because without
      // device storage it cannot know whether this visit came from an ad. If
      // the domain has no visit open at all and there is no gclid in sight,
      // this is ordinary organic traffic — discard it rather than filling
      // PendingEvents with noise.
      //
      // This runs only after both match attempts have failed. Checking it any
      // earlier is a race: workers run 16-at-a-time, so a heartbeat can reach
      // this code before the session_start beside it in the same batch has
      // committed. The domain then looks idle and a real ad visitor's event is
      // thrown away. That is exactly how a live 5s heartbeat was lost on
      // 16 Aug, leaving a converted session showing "< 1s".
      const hasGclidSignal =
        !!env.payload.session?.gclid || !!gclidFromReferrer(env.payload.referrer);
      if (!hasGclidSignal && !(await domainHasActiveSession(tenantId))) {
        return true;
      }

      await probeGraceMiss(context, tenantId, env, visitorHash, new Date(msg.receivedAt));

      await parkPendingEvent(msg, visitorHash);
      context.log(`[Worker] ${env.eventType} parked for reconciliation`, {
        domain: env.domain,
        eventType: env.eventType,
      });
      return true;
    }

    matchedSessionId = match.sessionId;
    campaign = {
      tenantId: match.tenantId,
      campaignId: match.campaignId,
      domainName: env.domain,
      googleCampaignId: googleCampaignId,
    };
  }

  try {
    await withTenantDb(campaign.tenantId, async (tx) => {
      const sessionId = await ensureSession(
        tx,
        msg,
        campaign!.tenantId,
        campaign!.campaignId,
        campaign!.googleCampaignId,
        matchedSessionId
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

      // Record where this visitor now is. The NEXT page's referrer is matched
      // against this, which is what keeps a journey intact when their IP
      // changes mid-visit (phone moving from WiFi to mobile data).
      await touchSession(tx, sessionId, env.payload.pagePath);

      // Landing on a page means the previous one is finished — settle its time
      // before this page starts adding to the total, so a lost page_end costs
      // us a few seconds rather than the whole of the next page.
      if (
        env.eventType === "session_start" ||
        env.eventType === "pageview" ||
        env.eventType === "bfpv"
      ) {
        await bankPreviousPage(tx, sessionId, env.ts ?? null);
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
        // tab_return sits here on purpose. It is recorded as a journey step and
        // nothing more: it never reaches updateSessionDwell below (that branch
        // names heartbeat and success_event explicitly), and it is absent from
        // the page-start list that drives bankPreviousPage — a tab switch does
        // not begin a new page. It is also deliberately NOT one of the event
        // types that count as interaction for is_bounce or the outcome badge:
        // switching away from a page is not engaging with it.
        case "tab_return":
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
          // bfpv is checked too, not just pageview. Both store as 'pageview',
          // so a pair arriving within the window is a duplicate regardless of
          // which beacon produced each half — and guarding only one of them let
          // every such pair through. Seen live on 17, 18 and 21 Aug as the same
          // page listed twice at the same second.
          if (env.eventType === "pageview" || env.eventType === "bfpv") {
            const existingPageview = await new mssql.Request(tx)
              .input("sessionId", mssql.UniqueIdentifier, sessionId)
              .input("pagePath", mssql.NVarChar, env.payload.pagePath ?? null)
              .input("clientTs", mssql.BigInt, env.ts ?? null)
              .input("occurredAt", mssql.DateTime2, new Date(msg.receivedAt))
              .query(
                // Scoped to the twin beacons, NOT to the whole session. Matching
                // on path alone — as this once did — swallowed every genuine
                // RE-visit to a page: a visitor going home -> contact -> back
                // -> contact had that second /contact silently discarded,
                // leaving back-navigations in the timeline with nothing to have
                // navigated back from.
                //
                // WHY THE TWINS EXIST: the tracker re-reads the gclid from the
                // URL on every page load, so returning to the landing page —
                // whose URL still carries ?gclid= — fires session_start again
                // alongside the ordinary pageview. Both store as 'pageview'.
                // Harmless otherwise; ensureSession finds the existing session
                // by gclid rather than making a second one.
                //
                // 100ms IS FROM MEASUREMENT, NOT TASTE. Every duplicate pair in
                // production sat between 1ms and 36ms apart; the next-closest
                // pair of same-path views was 1,077ms, and the rest were 3–4
                // seconds. Those larger gaps are real returns — a back button
                // or a refresh — and must survive. An earlier 3-second window
                // would have eaten them, which is exactly the back-button
                // behaviour this tracker exists to record.
                `SELECT TOP 1 1 FROM JourneyEvents
                 WHERE session_id = @sessionId AND event_type = 'pageview'
                   AND page_path = @pagePath
                   AND ABS(
                         COALESCE(client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', occurred_at))
                         - COALESCE(@clientTs, DATEDIFF_BIG(MILLISECOND, '19700101', @occurredAt))
                       ) <= 100`
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
          // success_event carries dwell for the same reason a heartbeat does:
          // it is a live, cumulative-for-this-page number. Treating it as a
          // heartbeat (isPageEnd false) means it never touches
          // completed_pages_duration_ms, so a page_end arriving afterwards
          // still banks the page exactly once. The monotonic guard inside
          // updateSessionDwell makes any overlap a no-op.
          if (
            (env.eventType === "heartbeat" || env.eventType === "success_event") &&
            env.payload.dwellMs != null
          ) {
            await updateSessionDwell(
              tx, sessionId, env.payload.dwellMs, env.payload.scrollPct, false, env.ts ?? null
            );
          }
          break;
        case "page_end":
          if (env.payload.dwellMs != null) {
            await updateSessionDwell(
              tx, sessionId, env.payload.dwellMs, env.payload.scrollPct, true, env.ts ?? null
            );
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

  return true;
}

app.storageQueue("queue-worker", {
  queueName: process.env.QUEUE_NAME ?? "clicklog-ingest",
  connection: "QUEUE_CONNECTION",
  handler: queueWorkerHandler,
});