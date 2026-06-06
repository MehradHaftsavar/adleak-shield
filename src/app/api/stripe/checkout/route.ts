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
        .query(`
          SELECT email, stripe_customer_id
          FROM Tenants
          WHERE tenant_id = @tenantId
        `);
      return result.recordset[0] ?? null;
    });

    if (!tenantRow) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const customerParam = tenantRow.stripe_customer_id
      ? { customer: tenantRow.stripe_customer_id as string }
      : { customer_email: tenantRow.email as string };

    const checkoutSession = await stripe.checkout.sessions.create({
      ...customerParam,
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      // Show terms + privacy links on the Stripe checkout page
      consent_collection: {
        terms_of_service: 'required',
      },
      custom_text: {
        terms_of_service_acceptance: {
          message: `I agree to the [Terms of Service](${process.env.NEXT_PUBLIC_APP_URL}/terms) and [Privacy Policy](${process.env.NEXT_PUBLIC_APP_URL}/privacy).`,
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      metadata: { tenantId },
      subscription_data: { metadata: { tenantId } },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('[stripe/checkout] Error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
