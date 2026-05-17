import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export async function isPaywalled(tenantId: string): Promise<boolean> {
  try {
    const row = await withAdminDb(async (req) => {
      const result = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          SELECT subscription_status, trial_ends_at
          FROM Tenants
          WHERE tenant_id = @tenantId
        `);
      return result.recordset[0] ?? null;
    });

    if (!row) return true;

    const status: string | null = row.subscription_status;
    const trialEndsAt: Date | null = row.trial_ends_at;

    if (status === 'active') return false;

    if (status === 'trialing' && trialEndsAt) {
      return new Date(trialEndsAt) <= new Date();
    }

    return true;
  } catch {
    // Fail open so a DB hiccup doesn't lock out legitimate subscribers
    return false;
  }
}
