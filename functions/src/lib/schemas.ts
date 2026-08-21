// =============================================================================
// AdLeak Shield — Ingestion Validation Schemas
// functions/src/lib/schemas.ts
//
// WHY ZOD:
// Every byte coming into the ingestion endpoint is untrusted — it's from
// arbitrary websites with our snippet on them. Zod ensures the shape is what
// we expect BEFORE we touch the queue or database. Anything malformed is
// silently dropped (we don't want to leak info about our schema to attackers).
// =============================================================================

import { z } from "zod";

// Allowed event types from the tracker — anything else is a bug or attack
const EVENT_TYPES = [
  "session_start",
  "pageview",
  "heartbeat",
  "click",
  "success_event",
  "page_end",
  "form_interact",
  // Fired on browser back/forward-cache restores — these never re-run the
  // tracker's page-load code (no new page fetch happens), so without this
  // the journey would otherwise show a silent gap when a visitor uses the
  // back button to return to an earlier page in the same session.
  "bfpv",
  // Fired when a visitor comes BACK to a tab they had switched away from,
  // carrying how long they were gone. Sent only on return, never on leaving:
  // a timer set in a hidden tab is throttled or frozen by browsers, so a
  // "send on hide" design loses the very events it exists to record. It also
  // means an ordinary page navigation can never produce one — the page unloads
  // and nothing comes back — so internal clicks are naturally excluded.
  "tab_return",
] as const;

// Session payload (sent on session_start only)
const SessionSchema = z.object({
  // Optional since the identifier moved server-side. Still accepted so events
  // from browsers running a cached copy of the old tracker keep validating.
  sessionFingerprint: z.string().min(8).max(200).optional(),
  keyword: z.string().max(255).optional().nullable(),
  matchType: z.string().max(20).optional().nullable(),
  campaignId: z.string().max(20).optional().nullable(),
  adgroupId: z.string().max(20).optional().nullable(),  // {adgroupid}
  adId: z.string().max(50).optional().nullable(),       // {creative} — the individual ad ID
  adPosition: z.string().max(20).optional().nullable(), // {adposition} — e.g. "1t2"
  gclid: z.string().max(100).optional().nullable(),
  device: z.enum(["desktop", "mobile", "tablet"]).optional().nullable(),
  landedAt: z.number().int().positive().optional(),
  landingPath: z.string().max(500).optional().nullable(),
});

// The inner payload field — different shape per event type
// We use a permissive object schema and validate specific fields per type below
const EventPayloadSchema = z
  .object({
    session: SessionSchema.optional(),
    // Legacy: the tracker used to generate this client-side and keep it in
    // sessionStorage. That is gone — the visitor hash is now derived server
    // side. Kept optional purely so events from browsers still running a
    // cached copy of the old script continue to validate during the
    // changeover. Safe to delete once those have aged out (~2 weeks).
    sessionFingerprint: z.string().min(8).max(200).optional(),
    // document.referrer, sent with EVERY event (not just the first). This is
    // what lets the server stitch pages together: page 2's referrer still
    // carries the landing URL including its gclid, and it does not change
    // when the visitor's IP does — which is why a mid-visit network switch no
    // longer breaks a journey.
    referrer: z.string().max(500).optional().nullable(),
    pagePath: z.string().max(500).optional().nullable(),
    elementTag: z.string().max(20).optional().nullable(),
    elementHref: z.string().max(500).optional().nullable(),
    elementText: z.string().max(100).optional().nullable(),
    dwellMs: z.number().int().min(0).max(86400000).optional(), // max 24h
    scrollPct: z.number().int().min(0).max(100).optional(),
    // tab_return only: how long the visitor was away. Deliberately separate
    // from dwellMs — dwellMs feeds the session duration, and time spent in
    // another tab must never be counted as time on the page.
    awayMs: z.number().int().min(0).max(86400000).optional(),
    referrerHost: z.string().max(253).optional().nullable(),
  })
  .strict(); // Reject any extra fields

// Top-level envelope from the tracker
export const IngestEnvelopeSchema = z
  .object({
    eventType: z.enum(EVENT_TYPES),
    payload: EventPayloadSchema,
    domain: z
      .string()
      .min(1)
      .max(253)
      .regex(/^[a-zA-Z0-9.:-]+$/, "Invalid domain"),
    ts: z.number().int().positive(),
  })
  .strict();

export type IngestEnvelope = z.infer<typeof IngestEnvelopeSchema>;
export type EventType = (typeof EVENT_TYPES)[number];

// =============================================================================
// QUEUE MESSAGE SCHEMA
// What we put on the queue after IP masking and adding server-side metadata.
// The Worker reads this exact shape from the queue.
// =============================================================================
export const QueueMessageSchema = z.object({
  envelope: IngestEnvelopeSchema,
  ipMasked: z.string().max(45),     // e.g. "82.12.34.xxx" or IPv6 equivalent
  // Server-derived visitor identifier — HMAC(daily salt, domain|ip|userAgent).
  // Computed in ingest so the raw IP never leaves that function's memory.
  visitorHash: z.string().max(64).optional(),
  // Only populated if ingest could not reach the salt table. The worker then
  // does the hashing instead, so a database blip degrades privacy for a few
  // seconds rather than dropping events. Never persisted.
  ipRaw: z.string().max(45).optional(),
  receivedAt: z.string().datetime(), // ISO 8601 timestamp from server
  userAgent: z.string().max(500),
  city: z.string().max(100).nullable(),    // from geoip-lite, looked up before masking
  country: z.string().max(2).nullable(),   // ISO 3166-1 alpha-2
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;
