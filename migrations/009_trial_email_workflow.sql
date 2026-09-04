-- =============================================================================
-- AdLeak Shield — Trial lifecycle emails (Logic App support)
-- migrations/009_trial_email_workflow.sql
--
-- Adds the two idempotency stamps and the two stored procedures the
-- "adleak-trial-emails" Logic App calls.
--
-- WHY STORED PROCEDURES rather than letting the Logic App run raw SQL:
--   1. Least privilege. The Logic App's managed identity is granted EXECUTE on
--      exactly these two procedures and nothing else — no table access at all.
--   2. The selection logic lives here, versioned in migrations, rather than
--      inside a workflow definition in the portal where it is invisible to code
--      review and impossible to diff.
--
-- WHY THE STAMPS: Logic Apps retries failed actions, and a recurrence can
-- overlap a slow previous run. Without a persisted "already sent" marker a
-- customer could receive the same email several times. The stamp is written
-- AFTER the send succeeds, so a failure mid-run re-sends rather than silently
-- skipping — the safer direction for a billing-related email.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Tenants') AND name = 'trial_reminder_sent_at')
  ALTER TABLE dbo.Tenants ADD trial_reminder_sent_at DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Tenants') AND name = 'trial_ended_email_sent_at')
  ALTER TABLE dbo.Tenants ADD trial_ended_email_sent_at DATETIME2 NULL;
GO

-- ---------------------------------------------------------------------------
-- Returns every tenant due an email right now, one row each, with the type.
-- Returns zero rows on a normal day — the Logic App branches on that.
-- ---------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_GetTrialEmailQueue
AS
BEGIN
  SET NOCOUNT ON;

  -- 1. Trial ending in 3 days or fewer, not yet reminded.
  --    Matches the dashboard banner, which appears at daysLeftInTrial <= 3
  --    (src/components/dashboard/DashboardContent.tsx). Email and UI must agree
  --    or the customer is told two different things on the same day.
  SELECT
      CAST(t.tenant_id AS NVARCHAR(36))                      AS tenantId,
      t.email                                                AS email,
      'reminder'                                             AS emailType,
      DATEDIFF(DAY, SYSUTCDATETIME(), t.trial_ends_at)       AS daysLeft,
      CONVERT(VARCHAR(10), t.trial_ends_at, 103)             AS trialEndsOn
  FROM dbo.Tenants t
  WHERE t.deleted_at              IS NULL
    AND t.subscription_status     = 'trialing'
    AND t.trial_reminder_sent_at  IS NULL
    AND t.trial_ends_at           > SYSUTCDATETIME()
    AND t.trial_ends_at          <= DATEADD(DAY, 3, SYSUTCDATETIME())

  UNION ALL

  -- 2. Trial has just lapsed and they never subscribed.
  --    The two-day floor matters on first deployment: without it, every trial
  --    that expired months ago would be emailed at once the first time this
  --    runs. It also means a workflow outage of a day or two self-heals rather
  --    than silently skipping people.
  SELECT
      CAST(t.tenant_id AS NVARCHAR(36)),
      t.email,
      'ended',
      0,
      CONVERT(VARCHAR(10), t.trial_ends_at, 103)
  FROM dbo.Tenants t
  WHERE t.deleted_at                 IS NULL
    AND t.subscription_status        = 'trialing'
    AND t.trial_ended_email_sent_at  IS NULL
    AND t.trial_ends_at             <= SYSUTCDATETIME()
    AND t.trial_ends_at              > DATEADD(DAY, -2, SYSUTCDATETIME());
END
GO

-- ---------------------------------------------------------------------------
-- Stamps one tenant as emailed. Called only after Resend returns success.
-- ---------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_MarkTrialEmailSent
    @tenantId  UNIQUEIDENTIFIER,
    @emailType NVARCHAR(20)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.Tenants
     SET trial_reminder_sent_at = CASE WHEN @emailType = 'reminder'
                                       THEN SYSUTCDATETIME()
                                       ELSE trial_reminder_sent_at END,
         trial_ended_email_sent_at = CASE WHEN @emailType = 'ended'
                                          THEN SYSUTCDATETIME()
                                          ELSE trial_ended_email_sent_at END
   WHERE tenant_id = @tenantId;
END
GO
