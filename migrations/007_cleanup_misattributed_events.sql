-- =============================================================================
-- 007 — One-off remediation: remove misattributed journey events
--
-- NOT a schema migration. A data correction, kept in the repo as the written
-- record of what was changed and why (GDPR Art. 5(1)(d), accuracy).
--
-- WHAT WENT WRONG
-- Between the compliance re-architecture and 17 Aug 2026, session matching
-- bounded its 30-minute window by processing time (Date.now()) rather than by
-- when the event arrived. Parked events are retried for 24 hours, so an event
-- from 08:42 was compared against a window centred on 10:48 and adopted by
-- whichever session was active then. Separately the gclid branch had no
-- recency bound, so a visit resuming an hour later was folded back in.
--
-- Symptoms: 103m/125m/177m "visits" with a single silent gap, journeys whose
-- first step predated their own landing, and a sessions list rendering out of
-- chronological order. Tenant scoping was never affected — every match was
-- scoped by tenant_id, so no customer saw another customer's data.
--
-- WHAT THIS DELETES
-- Exactly what the CURRENT rules would refuse to attach:
--   A. events that arrived more than 5 minutes BEFORE their session existed
--   B. every event from the first >30-minute silence onward
--
-- ORDER MATTERS — this is the bug in the first version of this script.
-- A and B must be evaluated in sequence, not together. Where foreign events
-- sit at the START of a session, the 3-hour hole between them and the session's
-- own events reads as a "silence", so a combined pass flags the GENUINE half
-- as B and empties the session. Removing A first, then looking for gaps in
-- what survives, leaves those sessions intact. On the real data this was the
-- difference between deleting 36 events (emptying four good sessions) and
-- deleting 16 (correct).
--
-- SCOPE DECISIONS
-- Rule A applies to all history: an event predating its own session is never
-- legitimate. Rule B applies only from 2026-08-16, when parking and
-- reconciliation went live. Before that there was no mechanism to misattribute
-- anything, so a gap is a real visitor genuinely returning — deleting those
-- would be destroying honest observations to make old data match new rules.
-- Sessions under an hour old are skipped so a live visit is never touched.
--
-- KNOWN LOSS, ACCEPTED
-- The 08:42:47–08:44:06 cluster on /contact (17 Aug) is ONE visitor whose
-- landing beacon was lost, so no session was ever created for them. Their
-- events were scattered across five later sessions. Removing them deletes the
-- only record of a genuine enquiry at 08:43:47 UTC ("Send Message" after
-- typing name and email). It cannot be attributed to an ad click, and the
-- customer was told separately.
--
-- HOW TO RUN
-- Steps 1–3 change nothing. Step 4 rolls back so the outcome can be inspected.
-- Only step 5 commits. SET XACT_ABORT ON means any error aborts the whole
-- transaction rather than leaving a partial change. Azure SQL point-in-time
-- restore is the backstop.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Which tenants exist. Only live customer domains need cleaning; a
-- domain absent here has no campaigns and therefore no sessions at all.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT DISTINCT tenant_id, domain_name FROM CampaignLookupCache ORDER BY domain_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — PREVIEW every event that would be deleted, and why. Changes nothing.
-- ─────────────────────────────────────────────────────────────────────────────
DECLARE @t UNIQUEIDENTIFIER = (SELECT TOP 1 tenant_id FROM CampaignLookupCache WHERE LOWER(domain_name) LIKE '%greatcarglass%');
DECLARE @b VARBINARY(128) = CAST(@t AS VARBINARY(128));
EXEC sp_set_session_context N'TenantId', @b, @read_only = 0;

WITH ev AS (
  SELECT je.event_id, je.session_id, je.event_type, je.page_path, je.element_text,
         COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND,'19700101',je.occurred_at)) AS ts,
         DATEDIFF_BIG(MILLISECOND,'19700101',s.started_at) AS start_ms,
         s.keyword, s.started_at
    FROM JourneyEvents je JOIN Sessions s ON s.session_id = je.session_id
   WHERE s.started_at < DATEADD(MINUTE,-60,SYSUTCDATETIME())
), badA AS (
  SELECT event_id FROM ev WHERE ts < start_ms - 300000
), kept AS (
  SELECT e.* FROM ev e WHERE e.event_id NOT IN (SELECT event_id FROM badA)
), seq AS (
  SELECT k.*, LAG(k.ts) OVER (PARTITION BY k.session_id ORDER BY k.ts) AS prev_ts
    FROM kept k WHERE k.started_at >= '2026-08-16'
), breaks AS (
  SELECT session_id, MIN(ts) AS break_ts FROM seq
   WHERE prev_ts IS NOT NULL AND ts - prev_ts > 1800000 GROUP BY session_id
)
SELECT e.keyword, e.started_at AS session_started,
       DATEADD(SECOND, e.ts/1000, '19700101') AS event_utc,
       e.event_type, e.page_path, e.element_text,
       CASE WHEN e.ts < e.start_ms - 300000 THEN 'A: predates its session'
            ELSE 'B: after a 30+ min silence' END AS reason
  FROM ev e
  LEFT JOIN breaks b ON b.session_id = e.session_id
 WHERE e.ts < e.start_ms - 300000
    OR (b.break_ts IS NOT NULL AND e.ts >= b.break_ts)
 ORDER BY e.started_at DESC, e.ts;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Scale check, split by reason. Changes nothing.
-- Observed 17 Aug 2026: A = 11 events / 5 sessions, B = 5 events / 1 session,
-- against 3,405 events and 564 sessions total.
-- ─────────────────────────────────────────────────────────────────────────────
DECLARE @t3 UNIQUEIDENTIFIER = (SELECT TOP 1 tenant_id FROM CampaignLookupCache WHERE LOWER(domain_name) LIKE '%greatcarglass%');
DECLARE @b3 VARBINARY(128) = CAST(@t3 AS VARBINARY(128));
EXEC sp_set_session_context N'TenantId', @b3, @read_only = 0;

WITH ev AS (
  SELECT je.event_id, je.session_id,
         COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND,'19700101',je.occurred_at)) AS ts,
         DATEDIFF_BIG(MILLISECOND,'19700101',s.started_at) AS start_ms, s.started_at
    FROM JourneyEvents je JOIN Sessions s ON s.session_id = je.session_id
   WHERE s.started_at < DATEADD(MINUTE,-60,SYSUTCDATETIME())
), badA AS (
  SELECT event_id FROM ev WHERE ts < start_ms - 300000
), kept AS (
  SELECT e.* FROM ev e WHERE e.event_id NOT IN (SELECT event_id FROM badA)
), seq AS (
  SELECT k.*, LAG(k.ts) OVER (PARTITION BY k.session_id ORDER BY k.ts) AS prev_ts
    FROM kept k WHERE k.started_at >= '2026-08-16'
), breaks AS (
  SELECT session_id, MIN(ts) AS break_ts FROM seq
   WHERE prev_ts IS NOT NULL AND ts - prev_ts > 1800000 GROUP BY session_id
), bad AS (
  SELECT e.event_id, e.session_id,
         CASE WHEN e.ts < e.start_ms - 300000 THEN 'A' ELSE 'B' END AS reason
    FROM ev e LEFT JOIN breaks b ON b.session_id = e.session_id
   WHERE e.ts < e.start_ms - 300000
      OR (b.break_ts IS NOT NULL AND e.ts >= b.break_ts)
)
SELECT reason, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions FROM bad GROUP BY reason
UNION ALL
SELECT 'TOTAL EVENTS IN DB', COUNT(*), COUNT(DISTINCT session_id) FROM JourneyEvents;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — DRY RUN. Deletes, rebuilds aggregates, shows the result, then rolls
-- everything back. Nothing is kept. Inspect the output before step 5.
-- ─────────────────────────────────────────────────────────────────────────────
SET XACT_ABORT ON;

DECLARE @t4 UNIQUEIDENTIFIER = (SELECT TOP 1 tenant_id FROM CampaignLookupCache WHERE LOWER(domain_name) LIKE '%greatcarglass%');
DECLARE @b4 VARBINARY(128) = CAST(@t4 AS VARBINARY(128));
EXEC sp_set_session_context N'TenantId', @b4, @read_only = 0;

IF OBJECT_ID('tempdb..#bad')      IS NOT NULL DROP TABLE #bad;
IF OBJECT_ID('tempdb..#affected') IS NOT NULL DROP TABLE #affected;
IF OBJECT_ID('tempdb..#totals')   IS NOT NULL DROP TABLE #totals;

WITH ev AS (
  SELECT je.event_id, je.session_id,
         COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND,'19700101',je.occurred_at)) AS ts,
         DATEDIFF_BIG(MILLISECOND,'19700101',s.started_at) AS start_ms, s.started_at
    FROM JourneyEvents je JOIN Sessions s ON s.session_id = je.session_id
   WHERE s.started_at < DATEADD(MINUTE,-60,SYSUTCDATETIME())
), badA AS (
  SELECT event_id FROM ev WHERE ts < start_ms - 300000
), kept AS (
  SELECT e.* FROM ev e WHERE e.event_id NOT IN (SELECT event_id FROM badA)
), seq AS (
  SELECT k.*, LAG(k.ts) OVER (PARTITION BY k.session_id ORDER BY k.ts) AS prev_ts
    FROM kept k WHERE k.started_at >= '2026-08-16'
), breaks AS (
  SELECT session_id, MIN(ts) AS break_ts FROM seq
   WHERE prev_ts IS NOT NULL AND ts - prev_ts > 1800000 GROUP BY session_id
)
SELECT e.event_id, e.session_id INTO #bad
  FROM ev e LEFT JOIN breaks b ON b.session_id = e.session_id
 WHERE e.ts < e.start_ms - 300000
    OR (b.break_ts IS NOT NULL AND e.ts >= b.break_ts);

SELECT DISTINCT session_id INTO #affected FROM #bad;

-- Refuse to proceed if the scale no longer matches what was previewed.
DECLARE @n INT = (SELECT COUNT(*) FROM #bad);
IF @n > 25
BEGIN
  RAISERROR('Found %d events to delete, expected ~16. Aborting - re-run the preview.', 16, 1, @n);
  RETURN;
END

BEGIN TRANSACTION;

DELETE FROM JourneyEvents WHERE event_id IN (SELECT event_id FROM #bad);

-- total_duration_ms is rebuilt as the sum of the largest remaining dwell per
-- page. dwell_time_ms on a heartbeat is cumulative for its own page, so the
-- max per page approximates that page's active time and the sum approximates
-- the visit's. It can understate a multi-page visit, never overstate one — and
-- the displayed duration takes the greater of this and the visible-event span.
SELECT g.session_id, SUM(g.mx) AS new_total INTO #totals
  FROM (SELECT je.session_id, je.page_path, MAX(je.dwell_time_ms) AS mx
          FROM JourneyEvents je
         WHERE je.event_type = 'heartbeat'
           AND je.session_id IN (SELECT session_id FROM #affected)
         GROUP BY je.session_id, je.page_path) g
 GROUP BY g.session_id;

UPDATE s
   SET total_duration_ms = t.new_total,
       completed_pages_duration_ms = 0,
       current_page_ts = NULL,
       max_scroll_pct = (SELECT MAX(je.scroll_depth_pct) FROM JourneyEvents je
                          WHERE je.session_id = s.session_id),
       is_bounce = CASE
         WHEN ISNULL(t.new_total,0) < 5000
              AND NOT EXISTS (SELECT 1 FROM JourneyEvents je
                               WHERE je.session_id = s.session_id
                                 AND je.event_type IN ('click','success_event'))
           THEN 1 ELSE 0 END
  FROM Sessions s
  LEFT JOIN #totals t ON t.session_id = s.session_id
 WHERE s.session_id IN (SELECT session_id FROM #affected);

SELECT s.keyword, s.started_at, s.total_duration_ms AS active_ms, s.is_bounce,
       (SELECT COUNT(*) FROM JourneyEvents je
         WHERE je.session_id = s.session_id AND je.event_type <> 'heartbeat') AS visible_steps,
       (SELECT ISNULL(MAX(COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND,'19700101',je.occurred_at)))
                    - MIN(COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND,'19700101',je.occurred_at))), 0)
          FROM JourneyEvents je
         WHERE je.session_id = s.session_id AND je.event_type <> 'heartbeat') AS new_span_ms
  FROM Sessions s
 WHERE s.session_id IN (SELECT session_id FROM #affected)
 ORDER BY s.started_at DESC;

ROLLBACK TRANSACTION;   -- <<< nothing above is kept


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5 — COMMIT. Run STEP 4 again with its final line changed from
--     ROLLBACK TRANSACTION;
-- to
--     COMMIT TRANSACTION;
-- Nothing else changes. Note the UTC time first, in case a restore is needed.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6 — Verify. No span should be wildly large afterwards.
-- ─────────────────────────────────────────────────────────────────────────────
DECLARE @t6 UNIQUEIDENTIFIER = (SELECT TOP 1 tenant_id FROM CampaignLookupCache WHERE LOWER(domain_name) LIKE '%greatcarglass%');
DECLARE @b6 VARBINARY(128) = CAST(@t6 AS VARBINARY(128));
EXEC sp_set_session_context N'TenantId', @b6, @read_only = 0;

SELECT s.keyword, s.started_at, s.total_duration_ms AS active_ms,
       (SELECT ISNULL(MAX(COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND,'19700101',je.occurred_at)))
                    - MIN(COALESCE(je.client_ts, DATEDIFF_BIG(MILLISECOND,'19700101',je.occurred_at))), 0)
          FROM JourneyEvents je
         WHERE je.session_id = s.session_id AND je.event_type <> 'heartbeat') AS span_ms
  FROM Sessions s
 WHERE s.started_at >= '2026-08-16'
 ORDER BY s.started_at DESC;
