import { withAdminDb, withTenantDb } from '@/lib/db/client';
import { PLAN_LIMITS } from '@/lib/planLimits';
import * as mssql from 'mssql';
import type { PlanType } from '@/types/auth';

export async function checkUsageAgainstPlan(
  tenantId: string,
  plan: PlanType,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const limits = PLAN_LIMITS[plan];

  const [rlsUsage, memberCount] = await Promise.all([
    withTenantDb(tenantId, async (req) => {
      const r = await req.query(`
        SELECT
          (SELECT COUNT(*) FROM Domains) AS domainCount,
          (SELECT ISNULL(MAX(cnt), 0) FROM (
            SELECT COUNT(*) AS cnt FROM Campaigns GROUP BY domain_id
          ) AS perDomain) AS maxCampaignsOnOneDomain
      `);
      return r.recordset[0] ?? { domainCount: 0, maxCampaignsOnOneDomain: 0 };
    }),
    withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT COUNT(*) AS cnt FROM TeamMembers WHERE tenant_id = @tenantId`);
      return (r.recordset[0]?.cnt ?? 0) as number;
    }),
  ]);

  const totalSeats = memberCount + 1; // +1 for owner
  const violations: string[] = [];

  if ((rlsUsage.domainCount ?? 0) > limits.domains)         violations.push('domains');
  if ((rlsUsage.maxCampaignsOnOneDomain ?? 0) > limits.campaignsPerDomain) violations.push('campaigns');
  if (totalSeats > limits.seats)                             violations.push('team members');

  if (violations.length === 0) return { ok: true };

  const list =
    violations.length === 1
      ? violations[0]
      : violations.slice(0, -1).join(', ') + ' and ' + violations[violations.length - 1];

  return {
    ok: false,
    error: `You have too many ${list} for the ${limits.label} plan. Please reduce them before switching.`,
  };
}
