import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import { checkUsageAgainstPlan } from '@/lib/checkPlanUsage';
import * as mssql from 'mssql';
import type { PlanType } from '@/types/auth';

export const dynamic = 'force-dynamic';

function priceIdForPlan(plan: PlanType): string {
  if (plan === 'freelancer') return process.env.STRIPE_PRICE_FREELANCER!;
  if (plan === 'agency')     return process.env.STRIPE_PRICE_AGENCY!;
  return process.env.STRIPE_PRICE_ID!; // starter / default
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Always bill the user's OWN account, not the active (switched) tenant
    const tenantId = session.user.tenantId as string;

    // Parse optional plan param — defaults to starter
    let plan: PlanType = 'starter';
    try {
      const body = await request.json();
      if (body?.plan === 'freelancer' || body?.plan === 'agency' || body?.plan === 'starter') {
        plan = body.plan as PlanType;
      }
    } catch {
      // No body or invalid JSON — use starter default
    }

    const tenantRow = await withAdminDb(async (req) => {
      const result = await req
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`SELECT email, stripe_customer_id FROM Tenants WHERE tenant_id = @tenantId`);
      return result.recordset[0] ?? null;
    });

    if (!tenantRow) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Limit check: block resubscription to a plan the user's current usage exceeds
    const limitCheck = await checkUsageAgainstPlan(tenantId, plan);
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.error }, { status: 400 });
    }

    const customerParam = tenantRow.stripe_customer_id
      ? { customer: tenantRow.stripe_customer_id as string }
      : { customer_email: tenantRow.email as string };

    const checkoutSession = await stripe.checkout.sessions.create({
      ...customerParam,
      mode: 'subscription',
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      // Automatic tax uses the billing address to calculate the correct tax rate.
      // Prices are marked tax-inclusive in Stripe, so £12.99 is always the final amount.
      automatic_tax: { enabled: true },
      // Allows business customers to enter their VAT number — enables EU reverse charge
      // (B2B sales become zero-rated so no VAT is charged to registered businesses).
      tax_id_collection: { enabled: true },
      // Required when tax_id_collection is enabled for an existing customer — allows
      // Stripe to update the customer's name from the checkout form.
      customer_update: { name: 'auto' },
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message: `I agree to the [Terms of Service](${process.env.NEXT_PUBLIC_APP_URL}/terms) and [Privacy Policy](${process.env.NEXT_PUBLIC_APP_URL}/privacy).`,
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment=success`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription`,
      metadata:          { tenantId, plan },
      subscription_data: { metadata: { tenantId, plan } },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('[stripe/checkout] Error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
