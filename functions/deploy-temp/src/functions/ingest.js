// =============================================================================
// AdLeak Shield — HTTP Ingestion Function
// functions/src/functions/ingest.ts
//
// WHAT THIS DOES (in order):
//   1. Accepts POST requests at /api/ingest
//   2. Handles CORS preflight (OPTIONS)
//   3. Reads the JSON body from the tracker
//   4. Validates with Zod — drops malformed silently (returns 204)
//   5. Extracts client IP from X-Forwarded-For
//   6. Masks the last octet
//   7. Wraps the data in a queue message envelope
//   8. Drops it on the queue via PutMessage
//   9. Returns 204 No Content
//
// CRITICAL CONSTRAINTS:
//   - NEVER write directly to SQL — Queue-First architecture
//   - NEVER reveal validation errors to the client — silent drop
//   - NEVER log full IP — only the masked form
//   - NEVER throw on bad input — always return a 2xx response
// =============================================================================
import { app, } from "@azure/functions";
import { IngestEnvelopeSchema } from "../lib/schemas.js";
import { enqueueMessage } from "../lib/queue.js";
import { extractClientIp, maskIp } from "../lib/ip-mask.js";
// CORS headers — applied to all responses including OPTIONS preflight
function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
}
/**
 * Match the request's Origin header against ALLOWED_ORIGINS.
 * "*" allows all (development). In production, set this to the customer
 * domains we have registered.
 *
 * For Phase 2, all customer sites need to be allowed. Phase 3 onboarding
 * lets tenants register their domains — we'll cross-check then.
 */
function pickAllowedOrigin(requestOrigin) {
    const allowList = (process.env.ALLOWED_ORIGINS ?? "*").trim();
    if (allowList === "*" || !requestOrigin)
        return "*";
    const list = allowList.split(",").map((s) => s.trim());
    return list.includes(requestOrigin) ? requestOrigin : list[0] ?? "*";
}
export async function ingestHandler(request, context) {
    const origin = request.headers.get("origin");
    const allowedOrigin = pickAllowedOrigin(origin);
    const baseHeaders = corsHeaders(allowedOrigin);
    // ---------- CORS preflight ----------
    if (request.method === "OPTIONS") {
        return { status: 204, headers: baseHeaders };
    }
    // ---------- Method check ----------
    if (request.method !== "POST") {
        return { status: 405, headers: baseHeaders, body: "" };
    }
    // ---------- Read body ----------
    // The tracker sends application/json via fetch or via Beacon API as a Blob.
    // Both result in a JSON-parseable body when we read it as text.
    let bodyText;
    try {
        bodyText = await request.text();
    }
    catch {
        // Body unreadable — silently drop
        return { status: 204, headers: baseHeaders };
    }
    if (!bodyText || bodyText.length === 0) {
        return { status: 204, headers: baseHeaders };
    }
    // Reject oversized payloads (defence against junk submissions)
    if (bodyText.length > 16_000) {
        context.warn("[Ingest] Oversized payload rejected", {
            bytes: bodyText.length,
        });
        return { status: 204, headers: baseHeaders };
    }
    // ---------- Parse JSON ----------
    let parsedJson;
    try {
        parsedJson = JSON.parse(bodyText);
    }
    catch {
        // Invalid JSON — silently drop
        return { status: 204, headers: baseHeaders };
    }
    // ---------- Validate with Zod ----------
    const validation = IngestEnvelopeSchema.safeParse(parsedJson);
    if (!validation.success) {
        // Don't echo back validation details — just drop
        context.log("[Ingest] Validation failed", {
            issues: validation.error.issues.length,
            firstIssue: validation.error.issues[0]?.path?.join(".") ?? "unknown",
        });
        return { status: 204, headers: baseHeaders };
    }
    const envelope = validation.data;
    // ---------- IP masking ----------
    // Extract from headers BEFORE the data leaves this function's memory
    const rawIp = extractClientIp(request.headers);
    const ipMasked = maskIp(rawIp);
    // ---------- Build queue message ----------
    const userAgent = (request.headers.get("user-agent") ?? "").substring(0, 500);
    const message = {
        envelope,
        ipMasked,
        receivedAt: new Date().toISOString(),
        userAgent,
    };
    // ---------- Enqueue ----------
    try {
        await enqueueMessage(message);
    }
    catch (err) {
        // Queue unreachable — log but tell the client it's fine.
        // We accept rare data loss during Azure outages over corrupting state.
        context.error("[Ingest] Queue enqueue failed", {
            err: err instanceof Error ? err.message : String(err),
            eventType: envelope.eventType,
            domain: envelope.domain,
        });
        // Still return 204 — the tracker doesn't retry, and a 5xx would just
        // generate noise in the customer's browser console
        return { status: 204, headers: baseHeaders };
    }
    // ---------- Success ----------
    return { status: 204, headers: baseHeaders };
}
// Register the function with the Azure Functions runtime
app.http("ingest", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous", // Public endpoint — tracker fires from any browser
    route: "ingest",
    handler: ingestHandler,
});
//# sourceMappingURL=ingest.js.map