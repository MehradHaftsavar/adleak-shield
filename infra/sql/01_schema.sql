-- =============================================================================
-- AdLeak Shield — Azure SQL Database Schema
-- Phase 1.1 — Ironclad Foundation
-- Run this file once against your Azure SQL database using Azure Query Editor
-- or SQL Server Management Studio (SSMS).
-- =============================================================================
-- IMPORTANT: Transparent Data Encryption (TDE) is ON by default on Azure SQL.
-- You do NOT need to run any TDE command — Microsoft enables it automatically.
-- This comment is here so you know encryption-at-rest is already active.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TENANTS
-- One row per AdLeak Shield account (one per £12.99/mo subscription).
-- A "tenant" is the person who signed up. Everything is scoped to this ID.
-- -----------------------------------------------------------------------------
CREATE TABLE Tenants (
    tenant_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    email            NVARCHAR(254)    NOT NULL,
    -- password_hash: bcrypt hash only — never store plaintext passwords
    password_hash    NVARCHAR(60)     NOT NULL,
    created_at       DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- trial_ends_at: set to created_at + 7 days on account creation
    trial_ends_at    DATETIMEOFFSET   NOT NULL,
    -- stripe_customer_id: populated after first Stripe checkout session
    stripe_customer_id   NVARCHAR(50) NULL,
    -- subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled'
    subscription_status  NVARCHAR(20) NOT NULL DEFAULT 'trialing',
    -- is_owner: TRUE only for your own email (the admin account)
    is_owner         BIT              NOT NULL DEFAULT 0,

    CONSTRAINT PK_Tenants PRIMARY KEY (tenant_id),
    CONSTRAINT UQ_Tenants_email UNIQUE (email),
    CONSTRAINT CHK_Tenants_subscription_status
        CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled'))
);

-- -----------------------------------------------------------------------------
-- PASSWORD_RESET_TOKENS
-- One-time use tokens for the "Forgot Password" flow.
-- Token expires after 1 hour. Used = true means it cannot be reused.
-- -----------------------------------------------------------------------------
CREATE TABLE PasswordResetTokens (
    token_id     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    tenant_id    UNIQUEIDENTIFIER NOT NULL,
    -- token_hash: SHA-256 hash of the raw token sent in the email link.
    -- Never store the raw token — store only the hash.
    token_hash   NVARCHAR(64)     NOT NULL,
    expires_at   DATETIMEOFFSET   NOT NULL,
    used         BIT              NOT NULL DEFAULT 0,
    created_at   DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),

    CONSTRAINT PK_PasswordResetTokens PRIMARY KEY (token_id),
    CONSTRAINT FK_PasswordResetTokens_Tenant
        FOREIGN KEY (tenant_id) REFERENCES Tenants(tenant_id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- DOMAINS
-- Each tenant on the Starter plan can register exactly 1 domain.
-- e.g. "my-site.co.uk" — stored without protocol or trailing slash.
-- The Double-Lock validation checks incoming click URLs against this.
-- -----------------------------------------------------------------------------
CREATE TABLE Domains (
    domain_id    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    tenant_id    UNIQUEIDENTIFIER NOT NULL,
    -- domain_name: store normalised, lowercase, no protocol, no trailing slash
    -- e.g. "my-site.co.uk" NOT "https://my-site.co.uk/"
    domain_name  NVARCHAR(253)    NOT NULL,
    created_at   DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- verified: flips to 1 when first heartbeat is received from this domain
    verified     BIT              NOT NULL DEFAULT 0,

    CONSTRAINT PK_Domains PRIMARY KEY (domain_id),
    CONSTRAINT FK_Domains_Tenant
        FOREIGN KEY (tenant_id) REFERENCES Tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT UQ_Domains_tenant_domain UNIQUE (tenant_id, domain_name)
);

-- -----------------------------------------------------------------------------
-- CAMPAIGNS (CampaignRegistry)
-- Stores the numeric Google Ads Campaign IDs the tenant registers.
-- Starter plan: maximum 3 rows per tenant. Enforced in application layer + DB.
-- slot_number: 1, 2, or 3. Used for abuse detection in admin panel.
-- -----------------------------------------------------------------------------
CREATE TABLE Campaigns (
    campaign_id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    tenant_id           UNIQUEIDENTIFIER NOT NULL,
    domain_id           UNIQUEIDENTIFIER NOT NULL,
    -- google_campaign_id: the numeric ID from Google Ads, e.g. "12345678"
    google_campaign_id  NVARCHAR(20)     NOT NULL,
    slot_number         TINYINT          NOT NULL, -- 1, 2, or 3
    created_at          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- status: 'awaiting_data' | 'active' | 'unregistered_traffic_detected'
    status              NVARCHAR(30)     NOT NULL DEFAULT 'awaiting_data',

    CONSTRAINT PK_Campaigns PRIMARY KEY (campaign_id),
    CONSTRAINT FK_Campaigns_Tenant
        FOREIGN KEY (tenant_id) REFERENCES Tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT FK_Campaigns_Domain
        FOREIGN KEY (domain_id) REFERENCES Domains(domain_id),
    CONSTRAINT UQ_Campaigns_tenant_google_id
        UNIQUE (tenant_id, google_campaign_id),
    CONSTRAINT CHK_Campaigns_slot
        CHECK (slot_number IN (1, 2, 3)),
    CONSTRAINT CHK_Campaigns_status
        CHECK (status IN ('awaiting_data', 'active', 'unregistered_traffic_detected'))
);

-- Prevent a 4th campaign being inserted for any tenant (Starter plan limit).
-- This is a database-level safeguard on top of the UI block.
CREATE TRIGGER TR_Campaigns_MaxThree
ON Campaigns
INSTEAD OF INSERT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM Campaigns c
        JOIN inserted i ON c.tenant_id = i.tenant_id
        GROUP BY c.tenant_id
        HAVING COUNT(*) >= 3
    )
    BEGIN
        RAISERROR('Starter plan limit: maximum 3 campaigns per tenant.', 16, 1);
        RETURN;
    END
    INSERT INTO Campaigns (campaign_id, tenant_id, domain_id, google_campaign_id, slot_number, status, avg_cpc)
    SELECT campaign_id, tenant_id, domain_id, google_campaign_id, slot_number, status, avg_cpc
    FROM inserted;
END;
GO

-- -----------------------------------------------------------------------------
-- SESSIONS
-- One row per visitor session that arrives via a Google Ad click.
-- session_fingerprint: hash of browser headers + masked IP — no cookies.
-- -----------------------------------------------------------------------------
CREATE TABLE Sessions (
    session_id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    tenant_id           UNIQUEIDENTIFIER NOT NULL,
    campaign_id         UNIQUEIDENTIFIER NOT NULL,
    -- session_fingerprint: SHA-256 hash, generated in the HTTP ingestion function
    session_fingerprint NVARCHAR(64)     NOT NULL,
    keyword             NVARCHAR(255)    NULL,
    match_type          NVARCHAR(20)     NULL, -- 'exact' | 'phrase' | 'broad'
    device              NVARCHAR(20)     NULL, -- 'desktop' | 'mobile' | 'tablet'
    -- gclid: Google Click ID — used only for deduplication, never for tracking
    gclid               NVARCHAR(100)    NULL,
    -- ip_masked: last octet already removed before storage, e.g. "82.12.34.xxx"
    ip_masked           NVARCHAR(20)     NULL,
    -- city/country: resolved via offline geoip lookup on the raw IP, before masking
    city                NVARCHAR(100)    NULL,
    country             NVARCHAR(2)      NULL, -- ISO 3166-1 alpha-2, e.g. "GB"
    started_at          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- total_duration_ms: populated when session ends or heartbeat stops
    total_duration_ms   INT              NULL,
    -- is_bounce: set to 1 if total_duration_ms < 5000 (under 5 seconds)
    is_bounce           BIT              NOT NULL DEFAULT 0,

    CONSTRAINT PK_Sessions PRIMARY KEY (session_id),
    CONSTRAINT FK_Sessions_Tenant
        FOREIGN KEY (tenant_id) REFERENCES Tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT FK_Sessions_Campaign
        FOREIGN KEY (campaign_id) REFERENCES Campaigns(campaign_id)
);

-- -----------------------------------------------------------------------------
-- CLICK_LOGS
-- The raw inbound data from the JS snippet, after Double-Lock validation passes.
-- One row per ad click (per gclid).
-- -----------------------------------------------------------------------------
CREATE TABLE ClickLogs (
    click_id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    tenant_id           UNIQUEIDENTIFIER NOT NULL,
    session_id          UNIQUEIDENTIFIER NOT NULL,
    campaign_id         UNIQUEIDENTIFIER NOT NULL,
    keyword             NVARCHAR(255)    NULL,
    match_type          NVARCHAR(20)     NULL,
    -- landing_url: the full URL the visitor landed on (page path only, no query string stored)
    landing_page_path   NVARCHAR(500)    NULL,
    clicked_at          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- estimated_cpc_gbp: populated from the tenant's average CPC setting (Phase 3)
    -- NULL until the tenant configures their avg CPC
    estimated_cpc_gbp   DECIMAL(10,4)    NULL,

    CONSTRAINT PK_ClickLogs PRIMARY KEY (click_id),
    CONSTRAINT FK_ClickLogs_Tenant
        FOREIGN KEY (tenant_id) REFERENCES Tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClickLogs_Session
        FOREIGN KEY (session_id) REFERENCES Sessions(session_id),
    CONSTRAINT FK_ClickLogs_Campaign
        FOREIGN KEY (campaign_id) REFERENCES Campaigns(campaign_id)
);

-- Index to speed up the Leak Table query (tenant + keyword + date range)
CREATE INDEX IX_ClickLogs_tenant_keyword_date
    ON ClickLogs (tenant_id, keyword, clicked_at);

-- -----------------------------------------------------------------------------
-- JOURNEY_EVENTS
-- One row per page the visitor visits within a session, plus click events.
-- This is what powers the Journey Timeline UI.
-- -----------------------------------------------------------------------------
CREATE TABLE JourneyEvents (
    event_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    tenant_id       UNIQUEIDENTIFIER NOT NULL,
    session_id      UNIQUEIDENTIFIER NOT NULL,
    -- event_type: 'pageview' | 'click' | 'success_event' | 'heartbeat'
    event_type      NVARCHAR(20)     NOT NULL,
    page_path       NVARCHAR(500)    NULL,
    -- element_tag: for click events, e.g. 'a', 'button', 'form'
    element_tag     NVARCHAR(20)     NULL,
    -- element_href: for link clicks, e.g. 'tel:07700900000' — GDPR: no personal data
    element_href    NVARCHAR(500)    NULL,
    scroll_depth_pct TINYINT         NULL, -- 0-100
    dwell_time_ms   INT              NULL,
    occurred_at     DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),

    CONSTRAINT PK_JourneyEvents PRIMARY KEY (event_id),
    CONSTRAINT FK_JourneyEvents_Tenant
        FOREIGN KEY (tenant_id) REFERENCES Tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT FK_JourneyEvents_Session
        FOREIGN KEY (session_id) REFERENCES Sessions(session_id),
    CONSTRAINT CHK_JourneyEvents_event_type
        CHECK (event_type IN ('pageview', 'click', 'success_event', 'heartbeat'))
);

-- Index to speed up Journey Timeline queries (load all events for a session)
CREATE INDEX IX_JourneyEvents_session
    ON JourneyEvents (tenant_id, session_id, occurred_at);

-- -----------------------------------------------------------------------------
-- UNREGISTERED_TRAFFIC_LOG
-- When the Double-Lock drops a click (unknown campaign ID or wrong domain),
-- we still log it here so the dashboard can alert the tenant.
-- No PII is stored — we log the unrecognised campaign ID only.
-- -----------------------------------------------------------------------------
CREATE TABLE UnregisteredTrafficLog (
    log_id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    tenant_id               UNIQUEIDENTIFIER NULL, -- NULL if we can't identify the tenant
    -- unrecognised_campaign_id: the {campaignid} value Google sent that we don't know
    unrecognised_campaign_id NVARCHAR(20)    NOT NULL,
    referring_domain        NVARCHAR(253)    NULL,
    logged_at               DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),

    CONSTRAINT PK_UnregisteredTrafficLog PRIMARY KEY (log_id)
);

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- This is the most important security feature in the entire database.
-- It means: even if there is a bug in the application code that accidentally
-- queries another tenant's data, the DATABASE ENGINE itself will block it.
-- Think of it as a bouncer at the database door — not just the app door.
-- =============================================================================

-- Step 1: Create a security predicate function.
-- This function takes a tenant_id column value and checks it against
-- the SESSION_CONTEXT value set by the application before each query.
CREATE FUNCTION dbo.fn_tenantSecurityPredicate(@tenant_id UNIQUEIDENTIFIER)
    RETURNS TABLE
    WITH SCHEMABINDING
AS
    RETURN SELECT 1 AS fn_result
    WHERE
        -- CAST is required because SESSION_CONTEXT returns SQL_VARIANT
        @tenant_id = CAST(SESSION_CONTEXT(N'TenantId') AS UNIQUEIDENTIFIER)
        -- Allow the Azure Functions Managed Identity (app user) full internal access
        -- for admin queries. We scope this via a separate DB user created in 02_users.sql
        OR USER_NAME() = 'adleak_admin_identity';
GO

-- Step 2: Create Security Policies — one per table that holds tenant data.
-- FILTER predicate: automatically adds WHERE tenant_id = [current tenant] to every SELECT.
-- BLOCK predicate: prevents INSERT/UPDATE of rows belonging to a different tenant.

CREATE SECURITY POLICY TenantIsolation_Tenants
    ADD FILTER PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Tenants,
    ADD BLOCK  PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Tenants
    WITH (STATE = ON);

CREATE SECURITY POLICY TenantIsolation_Domains
    ADD FILTER PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Domains,
    ADD BLOCK  PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Domains
    WITH (STATE = ON);

CREATE SECURITY POLICY TenantIsolation_Campaigns
    ADD FILTER PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Campaigns,
    ADD BLOCK  PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Campaigns
    WITH (STATE = ON);

CREATE SECURITY POLICY TenantIsolation_Sessions
    ADD FILTER PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Sessions,
    ADD BLOCK  PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.Sessions
    WITH (STATE = ON);

CREATE SECURITY POLICY TenantIsolation_ClickLogs
    ADD FILTER PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.ClickLogs,
    ADD BLOCK  PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.ClickLogs
    WITH (STATE = ON);

CREATE SECURITY POLICY TenantIsolation_JourneyEvents
    ADD FILTER PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.JourneyEvents,
    ADD BLOCK  PREDICATE dbo.fn_tenantSecurityPredicate(tenant_id) ON dbo.JourneyEvents
    WITH (STATE = ON);

-- Note: UnregisteredTrafficLog intentionally does NOT have RLS —
-- the admin panel reads across all tenants for system health monitoring.
-- The application layer must ensure only the admin role queries this table.
