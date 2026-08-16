// =============================================================================
// AdLeak Shield — Session duration (displayed)
// src/lib/db/sessionDuration.ts
//
// WHAT THIS IS:
// The single SQL expression behind every "total" duration a customer sees.
// The sessions table and the journey drawer both use it, which is the point:
// they used to each read Sessions.total_duration_ms directly, and because that
// column is still being written while a visit is in progress, the same session
// could show 25s in the table and 28s in the drawer a moment later. Deriving
// the number from stored events instead makes the two views agree by
// construction — same rows in, same answer out.
//
// WHAT IT MEASURES:
// The wall-clock span of everything recorded for the session: last event minus
// first event, heartbeats included so the time after the final click still
// counts. This is what the visitor's journey actually spans, and it is what
// someone reading the timeline expects the header to say.
//
// WHY NOT total_duration_ms:
// That column is ACTIVE dwell — it deliberately excludes time the tab was
// hidden, so a visitor who wanders off for ten minutes doesn't count as ten
// minutes of engagement. That makes it the right input for is_bounce and the
// Engaged badge, and the wrong number to label "total": a journey whose steps
// span eleven minutes reading "28s total" is simply confusing.
//
// It is still the floor here. A session with a single recorded event has a span
// of zero, and active dwell is the better answer in that case, so the larger of
// the two always wins. The displayed figure can therefore never be smaller than
// the time we actually measured.
//
// The alias `s` must refer to Sessions in the surrounding query.
// =============================================================================

/** Epoch-ms for an event, preferring the browser clock over our receive time. */
const EVENT_MS = `COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND, '19700101', je.occurred_at))`;

/** Wall-clock span of every recorded event in the session, in ms. */
const SPAN_MS = `(
    SELECT ISNULL(MAX(${EVENT_MS}) - MIN(${EVENT_MS}), 0)
      FROM JourneyEvents je
     WHERE je.session_id = s.session_id
  )`;

// Written as a bare correlated subquery repeated inside a CASE rather than
// computed once into a derived table: T-SQL will not let a derived table
// reference a column from an outer query, so the tidier `FROM (SELECT ...) x`
// form fails to bind. GREATEST() would avoid the repetition but needs
// compatibility level 130+, which is not worth depending on here.
export const SESSION_DURATION_MS = `(
  CASE
    WHEN ${SPAN_MS} > ISNULL(s.total_duration_ms, 0) THEN ${SPAN_MS}
    ELSE ISNULL(s.total_duration_ms, 0)
  END
)`;
