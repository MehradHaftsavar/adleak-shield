import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getPlanFromPriceId } from '@/lib/planLimits';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    console.error('[stripe/webhook] Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe/webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  console.log(`[stripe/webhook] Received: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenantId;
        const customerId = subscription.customer as string;

        if (!tenantId) {
          console.log('[stripe/webhook] customer.subscription.created: no tenantId in metadata — skipping');
          break;
        }

        // Always store stripe_customer_id so customer.subscription.updated
        // can find the tenant by customerId even if status starts as 'incomplete'.
        await withAdminDb(async (req) => {
          req
            .input('customerId', mssql.NVarChar(50), customerId)
            .input('tenantId', mssql.UniqueIdentifier, tenantId);

          if (subscription.status === 'active') {
            await req.query(`
              UPDATE Tenants
              SET stripe_customer_id        = @customerId,
                  subscription_status       = 'active',
                  subscription_cancelled_at = NULL,
                  data_deletion_warned_at   = NULL
              WHERE tenant_id = @tenantId
            `);
            console.log(`[stripe/webhook] Tenant ${tenantId} activated via subscription.created`);
          } else {
            // Not active yet (e.g. incomplete / trialing) — just store the customer ID
            await req.query(`
              UPDATE Tenants
              SET stripe_customer_id = @customerId
              WHERE tenant_id = @tenantId AND (stripe_customer_id IS NULL OR stripe_customer_id = '')
            `);
            console.log(`[stripe/webhook] Tenant ${tenantId} customer ID stored, status=${subscription.status}`);
          }
        });
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId   = session.metadata?.tenantId;
        const customerId = session.customer as string;

        if (!tenantId) {
          console.error('[stripe/webhook] checkout.session.completed: missing tenantId in metadata');
          break;
        }

        const plan = session.metadata?.plan ?? 'starter';

        await withAdminDb(async (req) => {
          await req
            .input('customerId', mssql.NVarChar(50),    customerId)
            .input('tenantId',   mssql.UniqueIdentifier, tenantId)
            .input('planType',   mssql.NVarChar(20),    plan)
            .query(`
              UPDATE Tenants
              SET stripe_customer_id        = @customerId,
                  subscription_status       = 'active',
                  plan_type                 = @planType,
                  subscription_cancelled_at = NULL,
                  data_deletion_warned_at   = NULL
              WHERE tenant_id = @tenantId
            `);
        });

        console.log(`[stripe/webhook] Tenant ${tenantId} activated plan=${plan}. Customer: ${customerId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const statusMap: Record<string, string> = {
          active: 'active',
          past_due: 'past_due',
          canceled: 'canceled',
          trialing: 'trialing',
          unpaid: 'past_due',
          incomplete: 'past_due',
          incomplete_expired: 'canceled',
          paused: 'canceled',
        };

        const mappedStatus = statusMap[subscription.status] ?? 'canceled';
        const isCanceled   = mappedStatus === 'canceled';
        const isActive     = mappedStatus === 'active';

        // Derive plan from the subscription's price ID
        const priceId  = subscription.items.data[0]?.price?.id ?? '';
        const planType = getPlanFromPriceId(priceId);
        if (!priceId) {
          console.warn('[stripe/webhook] subscription.updated: no price ID on subscription items');
        }

        await withAdminDb(async (req) => {
          req
            .input('customerId', mssql.NVarChar(50), customerId)
            .input('status',     mssql.NVarChar(20), mappedStatus)
            .input('planType',   mssql.NVarChar(20), planType);

          if (isCanceled) {
            await req.query(`
              UPDATE Tenants
              SET subscription_status        = @status,
                  plan_type                  = 'starter',
                  subscription_cancelled_at  = ISNULL(subscription_cancelled_at, GETUTCDATE()),
                  data_deletion_warned_at    = NULL
              WHERE stripe_customer_id = @customerId
                AND deleted_at IS NULL
            `);
          } else if (isActive) {
            await req.query(`
              UPDATE Tenants
              SET subscription_status        = @status,
                  plan_type                  = @planType,
                  subscription_cancelled_at  = NULL,
                  data_deletion_warned_at    = NULL
              WHERE stripe_customer_id = @customerId
                AND deleted_at IS NULL
            `);
          } else {
            await req.query(`
              UPDATE Tenants
              SET subscription_status = @status,
                  plan_type           = @planType
              WHERE stripe_customer_id = @customerId
                AND deleted_at IS NULL
            `);
          }
        });

        console.log(`[stripe/webhook] Subscription updated for ${customerId}: ${subscription.status} → ${mappedStatus}, plan=${planType}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Stamp cancellation timestamp (ISNULL = only set if not already set,
        // in case customer.subscription.updated fired first).
        // Clear data_deletion_warned_at so a fresh warning goes out in 85 days.
        await withAdminDb(async (req) => {
          await req
            .input('customerId', mssql.NVarChar(50), customerId)
            .query(`
              UPDATE Tenants
              SET subscription_status       = 'canceled',
                  subscription_cancelled_at = ISNULL(subscription_cancelled_at, GETUTCDATE()),
                  data_deletion_warned_at   = NULL
              WHERE stripe_customer_id = @customerId
                AND deleted_at IS NULL
            `);
        });

        console.log(`[stripe/webhook] Subscription deleted for ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await withAdminDb(async (req) => {
          await req
            .input('customerId', mssql.NVarChar(50), customerId)
            .query(`
              UPDATE Tenants
              SET subscription_status = 'past_due'
              WHERE stripe_customer_id = @customerId
                AND deleted_at IS NULL
            `);
        });

        console.log(`[stripe/webhook] Payment failed for ${customerId}`);
        break;
      }

      default:
        console.log(`[stripe/webhook] Unhandled event: ${event.type}`);
    }
  } catch (error) {
    console.error(`[stripe/webhook] Error processing ${event.type}:`, error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
