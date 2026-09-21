-- =============================================================================
-- AdLeak Shield — Record which legal terms each tenant accepted
-- migrations/010_terms_acceptance.sql
--
-- WHY THIS EXISTS:
-- The signup form already presents a proper clickwrap — the box is not
-- pre-ticked and the submit button is disabled until it is ticked
-- (src/app/auth/signup/page.tsx). But the acceptance was only ever React
-- state: the tick happened and then the evidence was gone.
--
-- UK GDPR Article 28 requires a written contract between the customer (the
-- controller of their visitors' data) and us (the processor), and Article 28(9)
-- permits electronic form — which a tickbox is. What it does not permit is
-- being unable to show WHAT was agreed and WHEN. Two columns fix that.
--
-- terms_version also matters going forward. Adding a sub-processor changes the
-- DPA, and without a version stamp there is no way to tell which customers
-- accepted the old text and therefore need to be asked again.
--
-- DELIBERATELY NULLABLE, AND DELIBERATELY NOT BACKFILLED:
-- Tenants who signed up before this migration did tick the box, but no record
-- was kept. Writing a plausible-looking timestamp now would be inventing
-- evidence, which is worse than having none. NULL means exactly what happened:
-- "accepted, before we started recording it."
--
-- Idempotent: safe to run more than once.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Tenants') AND name = 'terms_accepted_at')
  ALTER TABLE dbo.Tenants ADD terms_accepted_at DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Tenants') AND name = 'terms_version')
  ALTER TABLE dbo.Tenants ADD terms_version NVARCHAR(20) NULL;
GO
