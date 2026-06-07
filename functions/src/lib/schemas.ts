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
] as const;

// Session payload (sent on session_start only)
const SessionSchema = z.object({
  sessionFingerprint: z.string().min(8).max(200),
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
    sessionFingerprint: z.string().min(8).max(200).optional(),
    pagePath: z.string().max(500).optional().nullable(),
    elementTag: z.string().max(20).optional().nullable(),
    elementHref: z.string().max(500).optional().nullable(),
    elementText: z.string().max(100).optional().nullable(),
    dwellMs: z.number().int().min(0).max(86400000).optional(), // max 24h
    scrollPct: z.number().int().min(0).max(100).optional(),
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
  receivedAt: z.string().datetime(), // ISO 8601 timestamp from server
  userAgent: z.string().max(500),
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;
