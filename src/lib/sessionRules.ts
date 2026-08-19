// =============================================================================
// AdLeak Shield — Session rules shared by the dashboard
// src/lib/sessionRules.ts
// =============================================================================

/**
 * How long a visit may go quiet before it is over.
 *
 * MUST STAY EQUAL TO ACTIVE_WINDOW_MS in
 * functions/src/functions/queue-worker.ts.
 *
 * The worker uses it to decide whether an arriving event may still join a
 * session; the dashboard uses it to decide whether a journey may still gain
 * more steps. If the two ever disagree the UI contradicts itself — a journey
 * could show "Visit ended" and then a later step underneath it, or sit forever
 * on "still away" for a visit the server has already closed.
 *
 * They are separate deploy units (Azure Functions vs Vercel) with separate
 * tsconfigs, so a shared import isn't possible. This comment is the link.
 */
export const INACTIVITY_WINDOW_MS = 30 * 60 * 1000;

/** Scroll depth below which we treat a visit as not having scrolled at all. */
export const MEANINGFUL_SCROLL_PCT = 25;
