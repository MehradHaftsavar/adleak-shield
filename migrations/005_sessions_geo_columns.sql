-- =============================================================================
-- Migration 005: Add city, country to Sessions table
--
-- RUN THIS ON BOTH DATABASES:
--   1. adleak-db       (production)
--   2. adleak-db-dev   (development/test)
--
-- Safe to run multiple times — each ALTER is wrapped in a column-existence check.
-- =============================================================================

-- city     → resolved from the visitor's IP via geoip-lite (offline lookup,
--            performed before the IP is masked for GDPR compliance)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'city'
)
BEGIN
  ALTER TABLE Sessions ADD city NVARCHAR(100) NULL;
  PRINT 'Added column: city';
END
ELSE
  PRINT 'Column city already exists — skipped.';

-- country  → ISO 3166-1 alpha-2 country code (e.g. "GB", "US"), resolved
--            the same way as city
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'country'
)
BEGIN
  ALTER TABLE Sessions ADD country NVARCHAR(2) NULL;
  PRINT 'Added column: country';
END
ELSE
  PRINT 'Column country already exists — skipped.';

PRINT 'Migration 005 complete.';
