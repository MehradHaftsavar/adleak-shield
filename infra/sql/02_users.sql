-- =============================================================================
-- AdLeak Shield — Azure SQL Database Users & Permissions
-- Phase 1.1 — Run AFTER 01_schema.sql
-- =============================================================================
-- WHY THIS FILE EXISTS:
-- Azure Functions connect to SQL using a "Managed Identity" — which means
-- Microsoft Azure manages the password automatically and rotates it behind the
-- scenes. You never see, store, or touch a password. This file creates the
-- SQL user that maps to that identity and grants it the right permissions.
-- =============================================================================

-- Replace 'adleak-functions' below with the exact name of your Azure Functions
-- app resource (the name you chose when creating it in the Azure portal).
-- This name must match EXACTLY — including capitalisation.
CREATE USER [adleak-functions] FROM EXTERNAL PROVIDER;
GO

-- Grant the minimum permissions needed — no more, no less.
-- The app needs to read and write data, but cannot alter the schema.
ALTER ROLE db_datareader ADD MEMBER [adleak-functions];
ALTER ROLE db_datawriter ADD MEMBER [adleak-functions];
GO

-- Grant EXECUTE on the security predicate function so the Functions app can
-- satisfy the RLS policy when it sets SESSION_CONTEXT.
GRANT EXECUTE ON dbo.fn_tenantSecurityPredicate TO [adleak-functions];
GO

-- =============================================================================
-- ADMIN IDENTITY
-- The 'adleak_admin_identity' user is referenced in the RLS predicate function
-- (01_schema.sql). It represents a future admin-level connection that can
-- bypass per-tenant filtering for cross-tenant admin panel queries.
-- For MVP Phase 1, we create it but do not use it yet (Phase 6 — Admin Panel).
-- =============================================================================
-- Replace 'adleak-admin-functions' with the name of a SEPARATE Azure Functions
-- app you will create for admin-only operations. Do not use the same app.
-- For now, this just ensures the RLS predicate doesn't break.
-- You can run this block in Phase 6 when you create the admin functions app.
-- CREATE USER [adleak-admin-functions] FROM EXTERNAL PROVIDER;
-- EXEC sp_addrolemember 'db_datareader', 'adleak-admin-functions';
-- EXEC sp_addrolemember 'db_datawriter', 'adleak-admin-functions';
GO

-- =============================================================================
-- VERIFY
-- After running both SQL files, run these verification queries.
-- They should return rows — if they return empty, something went wrong.
-- =============================================================================
-- SELECT * FROM sys.tables WHERE name IN ('Tenants','Domains','Campaigns','Sessions','ClickLogs','JourneyEvents');
-- SELECT * FROM sys.security_policies;
-- SELECT * FROM sys.database_principals WHERE name = 'adleak-functions';
