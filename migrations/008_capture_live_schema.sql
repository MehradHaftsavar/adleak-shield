-- =============================================================================
-- 008 — Capture objects that existed only in the live database
--
-- WHY THIS FILE EXISTS
-- A number of columns, tables, indexes and programmable objects were created by
-- hand against production and never written down. The repo therefore could not
-- rebuild a working database: infra/sql/01_schema.sql produces a schema the
-- current code cannot run against.
--
-- Concretely, none of the following appeared anywhere in git before this file:
--   Sessions.session_cpc, max_scroll_pct, completed_pages_duration_ms,
--   last_page_path, last_event_at
--   tables HashSalts, PendingEvents, CampaignLookupCache
--   sp_LookupCampaignForWorker, trg_CampaignCache_Update
--   all three non-clustered indexes on Sessions
--   the widened CHECK constraint on JourneyEvents.event_type
--
-- Everything here is idempotent. Run against production it is a no-op; run
-- against an empty database it closes the gap left by 01_schema.sql.
--
-- Definitions were read back from production on 22 Aug 2026 via sys.columns,
-- sys.indexes and sys.sql_modules. Where something could not be read directly
-- it is marked INFERRED, with the reasoning and a verification query at the
-- bottom of this file. Do not treat an INFERRED line as confirmed.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Sessions — columns added after the original schema
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-session cost. Falls back to Campaigns.avg_cpc when null; both the leak
-- table and the weekly report price wasted clicks from COALESCE of the two.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'session_cpc')
  ALTER TABLE dbo.Sessions ADD session_cpc DECIMAL(10,4) NULL;
GO

-- Deepest scroll reached, 0-100. Also one half of the "did they interact at
-- all" test behind the No interaction badge (see MEANINGFUL_SCROLL_PCT).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'max_scroll_pct')
  ALTER TABLE dbo.Sessions ADD max_scroll_pct TINYINT NULL;
GO

-- Time banked from pages the visitor has finished with. total_duration_ms is
-- this plus the live dwell of the page they are on.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'completed_pages_duration_ms')
  ALTER TABLE dbo.Sessions ADD completed_pages_duration_ms INT NOT NULL
    CONSTRAINT DF_Sessions_completed_pages DEFAULT 0;
GO

-- Where the visitor currently is. The NEXT page's referrer is matched against
-- this, which is what keeps a journey intact when their IP changes mid-visit.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'last_page_path')
  ALTER TABLE dbo.Sessions ADD last_page_path NVARCHAR(500) NULL;
GO

-- When we last heard anything. Drives the 30-minute inactivity window that
-- decides whether an arriving event may still join this session.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'last_event_at')
  ALTER TABLE dbo.Sessions ADD last_event_at DATETIME2 NULL;
GO

-- current_page_ts is created by migration 006 and is not repeated here.


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sessions — indexes
--
-- Read back from sys.indexes. Note IX_Sessions_active lists all six columns as
-- KEY columns rather than includes, so only session_fingerprint is seekable on
-- it. The referrer-path branch of the matcher therefore scans; that is known
-- and acceptable at current volumes, but it is why IX_Sessions_fingerprint
-- exists separately and carries the branch that matters most.
-- ─────────────────────────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'IX_Sessions_active')
  CREATE NONCLUSTERED INDEX IX_Sessions_active ON dbo.Sessions
    (session_fingerprint, last_page_path, tenant_id, campaign_id, gclid, last_event_at);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'IX_Sessions_fingerprint')
  CREATE NONCLUSTERED INDEX IX_Sessions_fingerprint ON dbo.Sessions
    (session_fingerprint, last_event_at);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Sessions') AND name = 'IX_Sessions_gclid')
  CREATE NONCLUSTERED INDEX IX_Sessions_gclid ON dbo.Sessions (gclid);
GO


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. JourneyEvents — the CHECK constraint as it stands today
--
-- 01_schema.sql declares four event types. Production allows six: form_interact
-- was added without being recorded, and tab_return was added on 21 Aug 2026.
-- ─────────────────────────────────────────────────────────────────────────────

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_JourneyEvents_event_type')
  ALTER TABLE dbo.JourneyEvents DROP CONSTRAINT CHK_JourneyEvents_event_type;
GO
ALTER TABLE dbo.JourneyEvents ADD CONSTRAINT CHK_JourneyEvents_event_type
  CHECK (event_type IN ('pageview','click','success_event','heartbeat','form_interact','tab_return'));
GO


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HashSalts — the daily salt behind the visitor hash
--
-- The visitor identifier is HMAC(salt, domain|ip|user-agent). The salt rotates
-- every UTC day and the janitor deletes anything older than 48 hours, so once a
-- salt is gone the hashes it produced can no longer be tied to a visit by
-- anyone, including us. That property is what keeps the tracker outside
-- ePrivacy Article 5(3) — treat the retention window as a compliance control,
-- not a housekeeping detail.
--
-- salt_date is the primary key on purpose: several Function instances can hit a
-- brand-new day at once and each try to create it. Exactly one INSERT wins and
-- the losers read back the winner's value. Without that, two instances would
-- hash the same visitor differently and sessions would silently fail to match.
--
-- INFERRED: column types are taken from functions/src/lib/salt.ts, which binds
-- salt_date as mssql.Date and salt_value as mssql.VarChar(64).
-- ─────────────────────────────────────────────────────────────────────────────

IF OBJECT_ID('dbo.HashSalts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.HashSalts (
      salt_date  DATE        NOT NULL,
      salt_value VARCHAR(64) NOT NULL,
      CONSTRAINT PK_HashSalts PRIMARY KEY (salt_date)
  );
END
GO


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PendingEvents — events that could not be placed on arrival
--
-- Almost always a queue-ordering race: the worker processes 16 messages at a
-- time, so page 2 can genuinely be handled before page 1 has committed. The
-- reconciler retries these. Nothing is ever discarded silently here — that
-- silent drop is what cost roughly 14% of sessions before this existed.
--
-- status: 0 = pending, 1 = attached to a session, 2 = permanently unattributed.
-- The janitor deletes 1 and 2 after seven days and never touches 0.
--
-- INFERRED: reconstructed from the INSERT in queue-worker.ts (parkPendingEvent)
-- and the SELECT in reconcile.ts. Verify against production before relying on
-- this to rebuild.
-- ─────────────────────────────────────────────────────────────────────────────

IF OBJECT_ID('dbo.PendingEvents', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PendingEvents (
      id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
      domain       NVARCHAR(253)    NOT NULL,
      visitor_hash NVARCHAR(64)     NULL,
      referrer     NVARCHAR(500)    NULL,
      page_path    NVARCHAR(500)    NULL,
      event_type   NVARCHAR(30)     NOT NULL,
      payload_json NVARCHAR(MAX)    NOT NULL,
      client_ts    BIGINT           NULL,
      occurred_at  DATETIME2        NOT NULL,
      status       TINYINT          NOT NULL DEFAULT 0,
      attempts     INT              NOT NULL DEFAULT 0,
      created_at   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_PendingEvents PRIMARY KEY (id)
  );

  CREATE NONCLUSTERED INDEX IX_PendingEvents_pending
      ON dbo.PendingEvents (status, created_at);
END
GO


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CampaignLookupCache — domain/campaign resolution WITHOUT row-level security
--
-- This table is the reason the worker can function at all. Every other table
-- carries an RLS predicate keyed on SESSION_CONTEXT('TenantId') — but the
-- worker cannot set that context until it knows which tenant an event belongs
-- to, and it cannot learn that from an RLS-protected table. This cache breaks
-- the circle: no RLS, so it is readable before any context is set.
--
-- Kept in step with Campaigns by trg_CampaignCache_Update below. It holds no
-- visitor data — only campaign and domain identifiers.
--
-- Columns read back from production. INFERRED: the primary key. The trigger
-- MERGEs on google_campaign_id and the stored procedure selects TOP 1 by it, so
-- it is almost certainly the key — but that was not read directly. See the
-- verification query at the end of this file.
-- ─────────────────────────────────────────────────────────────────────────────

IF OBJECT_ID('dbo.CampaignLookupCache', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CampaignLookupCache (
      google_campaign_id NVARCHAR(20)     NOT NULL,
      tenant_id          UNIQUEIDENTIFIER NOT NULL,
      campaign_id        UNIQUEIDENTIFIER NOT NULL,
      domain_name        NVARCHAR(253)    NOT NULL,
      CONSTRAINT PK_CampaignLookupCache PRIMARY KEY (google_campaign_id)  -- INFERRED
  );

  -- The worker also resolves tenant BY DOMAIN, matching both bare and www forms.
  CREATE NONCLUSTERED INDEX IX_CampaignLookupCache_domain
      ON dbo.CampaignLookupCache (domain_name);
END
GO


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. sp_LookupCampaignForWorker — read back verbatim from production
-- ─────────────────────────────────────────────────────────────────────────────

IF OBJECT_ID('dbo.sp_LookupCampaignForWorker', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_LookupCampaignForWorker;
GO
CREATE PROCEDURE dbo.sp_LookupCampaignForWorker
  @googleCampaignId NVARCHAR(20)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1
    tenant_id,
    campaign_id,
    google_campaign_id,
    domain_name
  FROM CampaignLookupCache
  WHERE google_campaign_id = @googleCampaignId;
END;
GO


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. trg_CampaignCache_Update — read back verbatim from production
--
-- Keeps the cache in step with Campaigns. If this trigger is ever lost, the
-- cache silently stops updating: new campaigns are not resolvable, and their
-- events are dropped as "unregistered domain" with no error anywhere.
-- ─────────────────────────────────────────────────────────────────────────────

IF OBJECT_ID('dbo.trg_CampaignCache_Update', 'TR') IS NOT NULL
  DROP TRIGGER dbo.trg_CampaignCache_Update;
GO
CREATE TRIGGER trg_CampaignCache_Update
ON dbo.Campaigns
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;

  -- Delete removed campaigns
  DELETE FROM CampaignLookupCache
  WHERE google_campaign_id IN (SELECT google_campaign_id FROM deleted);

  -- Upsert new/updated campaigns
  MERGE CampaignLookupCache AS target
  USING (
    SELECT i.google_campaign_id, i.tenant_id, i.campaign_id, d.domain_name
    FROM inserted i
    INNER JOIN Domains d ON d.domain_id = i.domain_id
  ) AS source
  ON target.google_campaign_id = source.google_campaign_id
  WHEN MATCHED THEN
    UPDATE SET
      tenant_id = source.tenant_id,
      campaign_id = source.campaign_id,
      domain_name = source.domain_name
  WHEN NOT MATCHED THEN
    INSERT (google_campaign_id, tenant_id, campaign_id, domain_name)
    VALUES (source.google_campaign_id, source.tenant_id, source.campaign_id, source.domain_name);
END;
GO


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY THE INFERRED BITS
--
-- Run this against production and compare. The three tables marked INFERRED
-- above were reconstructed from application code rather than read back, so this
-- is the check that turns them from a good guess into a recorded fact.
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT t.name AS table_name, c.name AS column_name, ty.name AS type,
--        c.max_length, c.is_nullable
--   FROM sys.tables t
--   JOIN sys.columns c ON c.object_id = t.object_id
--   JOIN sys.types ty ON ty.user_type_id = c.user_type_id
--  WHERE t.name IN ('HashSalts', 'PendingEvents', 'CampaignLookupCache')
--  ORDER BY t.name, c.column_id;

-- SELECT t.name AS table_name, i.name AS index_name, i.is_primary_key,
--        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS cols
--   FROM sys.tables t
--   JOIN sys.indexes i ON i.object_id = t.object_id
--   JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
--   JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
--  WHERE t.name IN ('HashSalts', 'PendingEvents', 'CampaignLookupCache')
--  GROUP BY t.name, i.name, i.is_primary_key
--  ORDER BY t.name, i.name;
