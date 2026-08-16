-- =============================================================================
-- 006 — Sessions.current_page_ts
--
-- WHY:
-- Session duration is assembled from two columns: completed_pages_duration_ms
-- (pages the visitor has finished) and total_duration_ms (that base plus the
-- live dwell reported by the page they are on). Heartbeats only ever raised
-- total_duration_ms, so nothing was banked until that page's page_end arrived.
-- When a page_end went missing the next page started counting from zero and
-- everything it accumulated stayed invisible until it passed the previous
-- page's high-water mark — a real 65s + 19s two-page visit displayed as 59s.
--
-- The worker now banks the previous page's time whenever a new page begins.
-- That makes the ORDER events arrive in significant, and the queue delivers
-- them concurrently (batchSize 16) and at-least-once. This column records the
-- client-clock timestamp of the page the session is currently on, so a beacon
-- belonging to an already-banked page — a late page_end, a stale heartbeat, or
-- a queue redelivery — is recognised and skipped instead of counted twice.
--
-- Existing rows stay NULL, which reads as "no page marker yet" and behaves
-- exactly as before until the session's next page-start beacon sets it. Safe
-- to run on a live database: adding a NULLable column is metadata-only and
-- takes no table lock of consequence.
--
-- RUN THIS BEFORE DEPLOYING THE FUNCTIONS THAT REFERENCE IT.
-- =============================================================================

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'current_page_ts'
)
BEGIN
  ALTER TABLE dbo.Sessions ADD current_page_ts BIGINT NULL;
END
GO

-- Verification — expects one row: current_page_ts / bigint / is_nullable = 1
SELECT c.name, t.name AS type_name, c.is_nullable
  FROM sys.columns c
  JOIN sys.types t ON t.user_type_id = c.user_type_id
 WHERE c.object_id = OBJECT_ID('dbo.Sessions')
   AND c.name = 'current_page_ts';
GO
