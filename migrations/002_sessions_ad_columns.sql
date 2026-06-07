-- =============================================================================
-- Migration 002: Add ad_group_id, ad_id, ad_position to Sessions table
--
-- RUN THIS ON BOTH DATABASES:
--   1. adleak-db       (production)
--   2. adleak-db-dev   (development/test)
--
-- Safe to run multiple times — each ALTER is wrapped in a column-existence check.
-- =============================================================================

-- ad_group_id  → captured from {adgroupid} ValueTrack parameter
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'ad_group_id'
)
BEGIN
  ALTER TABLE Sessions ADD ad_group_id NVARCHAR(20) NULL;
  PRINT 'Added column: ad_group_id';
END
ELSE
  PRINT 'Column ad_group_id already exists — skipped.';

-- ad_id        → captured from {creative} ValueTrack parameter (the individual ad ID)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'ad_id'
)
BEGIN
  ALTER TABLE Sessions ADD ad_id NVARCHAR(50) NULL;
  PRINT 'Added column: ad_id';
END
ELSE
  PRINT 'Column ad_id already exists — skipped.';

-- ad_position  → captured from {adposition} ValueTrack parameter (e.g. "1t2")
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'ad_position'
)
BEGIN
  ALTER TABLE Sessions ADD ad_position NVARCHAR(20) NULL;
  PRINT 'Added column: ad_position';
END
ELSE
  PRINT 'Column ad_position already exists — skipped.';

PRINT 'Migration 002 complete.';
