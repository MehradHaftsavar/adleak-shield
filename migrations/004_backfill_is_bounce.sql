-- =============================================================================
-- Migration 004 — Backfill is_bounce for sessions created before the
--                 pessimistic-default fix (queue-worker INSERT now sets is_bounce=1)
--
-- PROBLEM: Sessions inserted before this fix defaulted to is_bounce=0.
--          If the tab was killed before page_end fired, is_bounce stayed 0
--          forever, so sessions appeared as "Engaged" and never appeared
--          in the LeakTable.
--
-- FIX: Mark existing sessions as bounces if:
--   (a) total_duration_ms IS NULL  → page_end never arrived (tab killed abruptly)
--   (b) total_duration_ms < 5000 AND no click/success_event in JourneyEvents
--
-- SAFE TO RUN MULTIPLE TIMES: the WHERE is_bounce = 0 guard makes it idempotent.
-- Time guard (> 30 minutes old) avoids touching sessions that might still be live.
-- =============================================================================

UPDATE s
SET    s.is_bounce = 1
FROM   Sessions s
WHERE  s.is_bounce = 0
  AND  s.keyword <> 'adleak_test'
  AND  s.started_at < DATEADD(minute, -30, GETUTCDATE())   -- skip sessions < 30 min old
  AND (
        -- Case A: page_end never arrived — total_duration_ms is still NULL
        s.total_duration_ms IS NULL

        OR

        -- Case B: got a dwell update but it was a short visit with no engagement
        (
          s.total_duration_ms < 5000
          AND NOT EXISTS (
            SELECT 1
            FROM   JourneyEvents je
            WHERE  je.session_id = s.session_id
              AND  je.event_type IN ('click', 'success_event')
          )
        )
      );

-- Preview how many rows will be affected before running:
-- SELECT COUNT(*) FROM Sessions s
-- WHERE s.is_bounce = 0
--   AND s.keyword <> 'adleak_test'
--   AND s.started_at < DATEADD(minute, -30, GETUTCDATE())
--   AND (
--     s.total_duration_ms IS NULL
--     OR (
--       s.total_duration_ms < 5000
--       AND NOT EXISTS (
--         SELECT 1 FROM JourneyEvents je
--         WHERE je.session_id = s.session_id
--           AND je.event_type IN ('click', 'success_event')
--       )
--     )
--   );
