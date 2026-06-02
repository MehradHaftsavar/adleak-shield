import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;

    const tenantRow = await withAdminDb(async (req) => {
      const result = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT stripe_customer_id FROM Tenants WHERE tenant_id = @tenantId`);
      return result.recordset[0] ?? null;
    });

    if (!tenantRow?.stripe_customer_id) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenantRow.stripe_customer_id as string,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error('[stripe/portal] Error:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
