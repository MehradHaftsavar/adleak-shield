-- =====================================================
-- AdLeak Shield - Phase 3.1 Database Migration
-- Onboarding Flow Tables and Updates
-- =====================================================
-- Run this script in Azure SQL Database Query Editor
-- or Azure Data Studio connected to adleak-db
-- =====================================================

-- 1. Create Campaigns table for storing registered Google Ads Campaign IDs
CREATE TABLE Campaigns (
    id INT IDENTITY(1,1) PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    campaign_id NVARCHAR(50) NOT NULL,
    slot_number INT NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
    campaign_name NVARCHAR(255),
    registered_at DATETIME2 DEFAULT GETDATE() NOT NULL,
    is_active BIT DEFAULT 1 NOT NULL,
    linked_domain NVARCHAR(255) NOT NULL,
    
    -- Foreign key with cascade delete
    CONSTRAINT FK_Campaigns_Tenants 
        FOREIGN KEY (tenant_id) 
        REFERENCES Tenants(tenant_id) 
        ON DELETE CASCADE,
    
    -- Ensure unique campaign_id per tenant
    CONSTRAINT UQ_Campaigns_TenantCampaign 
        UNIQUE (tenant_id, campaign_id)
);
GO

-- 2. Create indexes for performance
CREATE INDEX idx_campaigns_tenant 
    ON Campaigns(tenant_id, is_active);
GO

CREATE INDEX idx_campaigns_campaign_id 
    ON Campaigns(campaign_id);
GO

CREATE INDEX idx_campaigns_slot 
    ON Campaigns(tenant_id, slot_number);
GO

-- 3. Add onboarding_completed flag to Tenants table
ALTER TABLE Tenants 
    ADD onboarding_completed BIT DEFAULT 0 NOT NULL;
GO

-- 4. Update ClickLogs table with validation fields
ALTER TABLE ClickLogs 
    ADD is_validated BIT DEFAULT 0 NOT NULL;
GO

ALTER TABLE ClickLogs 
    ADD validation_failure_reason NVARCHAR(255);
GO

ALTER TABLE ClickLogs 
    ADD session_duration INT DEFAULT 0;
GO

-- 5. Add success event tracking to JourneyEvents
ALTER TABLE JourneyEvents 
    ADD is_success_event BIT DEFAULT 0 NOT NULL;
GO

-- 6. Add bounce tracking to Sessions
ALTER TABLE Sessions 
    ADD is_bounce BIT DEFAULT 0 NOT NULL;
GO

-- 7. Create Row-Level Security (RLS) policy for Campaigns table
-- This ensures users can only see their own campaigns
CREATE SECURITY POLICY CampaignsRLSPolicy
ADD FILTER PREDICATE dbo.fn_tenantAccessPredicate(tenant_id)
ON dbo.Campaigns
WITH (STATE = ON);
GO

-- 8. Verify all tables exist
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO

-- 9. Verify Campaigns table structure
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Campaigns'
ORDER BY ORDINAL_POSITION;
GO

-- 10. Check RLS policies are active
SELECT 
    t.name AS table_name,
    p.name AS policy_name,
    sp.is_enabled
FROM sys.security_policies sp
JOIN sys.tables t ON sp.object_id = t.object_id
JOIN sys.security_predicates p ON p.object_id = sp.object_id
WHERE t.name IN ('Tenants', 'Campaigns', 'ClickLogs', 'JourneyEvents', 'Sessions');
GO

-- =====================================================
-- Migration Complete ✅
-- =====================================================

PRINT '✅ Phase 3.1 database migration completed successfully!';
PRINT '✅ Campaigns table created';
PRINT '✅ Indexes added for performance';
PRINT '✅ Validation fields added to ClickLogs';
PRINT '✅ Row-Level Security policies applied';
GO
