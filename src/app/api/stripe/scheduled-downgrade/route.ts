import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import { getPlanFromPriceId, PLAN_LIMITS } from '@/lib/planLimits';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ scheduled: null });
    }

    const tenantId = session.user.tenantId as string;

    const tenantRow = await withAdminDb(async (req) => {
      const r = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT stripe_customer_id FROM Tenants WHERE tenant_id = @tenantId`);
      return r.recordset[0] ?? null;
    });

    if (!tenantRow?.stripe_customer_id) {
      return NextResponse.json({ scheduled: null });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: tenantRow.stripe_customer_id as string,
      status: 'active',
      limit: 1,
    });

    const sub = subscriptions.data[0];
    if (!sub?.schedule) {
      return NextResponse.json({ scheduled: null });
    }

    const schedule = await stripe.subscriptionSchedules.retrieve(sub.schedule as string);
    if (schedule.status !== 'active' || schedule.phases.length < 2) {
      return NextResponse.json({ scheduled: null });
    }

    const nextPhase = schedule.phases[1];
    const priceId   = nextPhase.items[0]?.price as string | undefined;
    const plan      = priceId ? getPlanFromPriceId(priceId) : null;
    const startDate = nextPhase.start_date; // Unix timestamp

    if (!plan || !startDate) {
      return NextResponse.json({ scheduled: null });
    }

    return NextResponse.json({
      scheduled: {
        plan,
        label:     PLAN_LIMITS[plan].label,
        date:      new Date(startDate * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      },
    });
  } catch {
    return NextResponse.json({ scheduled: null });
  }
}
