import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOwner, ownerNotFound, IMP_COOKIE } from '@/lib/adminAuth';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

// Returns the impersonated tenant's domains so the nav dropdown shows the right list.
export async function GET() {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  const cookieStore = await cookies();
  const impCookie   = cookieStore.get(IMP_COOKIE);
  if (!impCookie?.value) {
    return NextResponse.json({ domains: [] });
  }

  const tenantId = impCookie.value;

  const domains = await withAdminDb(async (req) => {
    const result = await req
      .input('tenantId', mssql.UniqueIdentifier, tenantId)
      .query(`
        SELECT d.domain_id, d.domain_name, t.email AS owner_email
        FROM   Domains d
        INNER JOIN Tenants t ON t.tenant_id = d.tenant_id
        WHERE  d.tenant_id = @tenantId
          AND  t.deleted_at IS NULL
        ORDER BY d.domain_name
      `);
    return result.recordset.map((row: { domain_id: string; domain_name: string; owner_email: string }) => ({
      tenantId,
      domainId:         row.domain_id,
      domainName:       row.domain_name,
      role:             'owner' as const,
      tenantOwnerEmail: row.owner_email,
    }));
  });

  return NextResponse.json({ domains });
}
