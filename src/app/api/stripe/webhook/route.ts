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

        // cancel_at_period_end means the user chose to cancel — treat as canceled immediately
        const effectiveStatus = subscription.cancel_at_period_end ? 'canceled' : subscription.status;
        const mappedStatus = statusMap[effectiveStatus] ?? 'canceled';
        const isCanceled   = mappedStatus === 'canceled';
        const isActive     = mappedStatus === 'active';

        // Derive plan from the subscription's price ID
        const priceId  = subscription.items.data[0]?.price?.id ?? '';
        const planType = getPlanFromPriceId(priceId);
        if (!priceId) {
          console.warn('[stripe/webhook] subscription.updated: no price ID on subscription items');
        }

        // If this subscription is being cancelled, check whether the customer has
        // another active subscription before downgrading the DB. This prevents a
        // stale cancel event for an old subscription from overwriting a newly
        // created active subscription.
        if (isCanceled) {
          const otherActive = await stripe.subscriptions.list({
            customer: customerId,
            status:   'active',
            limit:    1,
          });
          // Exclude cancel_at_period_end subs — they are effectively canceled too
          const other = otherActive.data.find(s => s.id !== subscription.id && !s.cancel_at_period_end);
          if (other) {
            const otherPriceId = other.items.data[0]?.price?.id ?? '';
            const otherPlan    = getPlanFromPriceId(otherPriceId);
            await withAdminDb(async (req) => {
              await req
                .input('customerId', mssql.NVarChar(50), customerId)
                .input('planType',   mssql.NVarChar(20), otherPlan)
                .query(`
                  UPDATE Tenants
                  SET subscription_status       = 'active',
                      plan_type                 = @planType,
                      subscription_cancelled_at = NULL,
                      data_deletion_warned_at   = NULL
                  WHERE stripe_customer_id = @customerId
                    AND deleted_at IS NULL
                `);
            });
            console.log(`[stripe/webhook] Cancel event for ${customerId} ignored — another active sub exists (plan=${otherPlan})`);
            break;
          }
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

        // If the customer has another active subscription, don't mark them as canceled.
        // This prevents a delete event for an old subscription from overwriting a newly
        // created active subscription.
        const otherActiveSubs = await stripe.subscriptions.list({
          customer: customerId,
          status:   'active',
          limit:    1,
        });
        // Exclude cancel_at_period_end subs — they are effectively canceled too
        const otherActive = otherActiveSubs.data.find(s => s.id !== subscription.id && !s.cancel_at_period_end);
        if (otherActive) {
          const otherPriceId = otherActive.items.data[0]?.price?.id ?? '';
          const otherPlan    = getPlanFromPriceId(otherPriceId);
          await withAdminDb(async (req) => {
            await req
              .input('customerId', mssql.NVarChar(50), customerId)
              .input('planType',   mssql.NVarChar(20), otherPlan)
              .query(`
                UPDATE Tenants
                SET subscription_status       = 'active',
                    plan_type                 = @planType,
                    subscription_cancelled_at = NULL,
                    data_deletion_warned_at   = NULL
                WHERE stripe_customer_id = @customerId
                  AND deleted_at IS NULL
              `);
          });
          console.log(`[stripe/webhook] Delete event for ${customerId} ignored — another active sub exists (plan=${otherPlan})`);
          break;
        }

        // Issue a prorated refund for unused time in the billing period.
        // Only applies when cancelled immediately (canceledAt < periodEnd).
        try {
          const canceledAt    = subscription.canceled_at ?? Math.floor(Date.now() / 1000);
          const periodStart   = subscription.current_period_start;
          const periodEnd     = subscription.current_period_end;
          const totalSeconds  = periodEnd - periodStart;
          const unusedSeconds = periodEnd - canceledAt;

          if (unusedSeconds > 0 && totalSeconds > 0) {
            const invoiceId = typeof subscription.latest_invoice === 'string'
              ? subscription.latest_invoice
              : (subscription.latest_invoice as Stripe.Invoice | null)?.id;

            if (invoiceId) {
              const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['charge'] });
              const charge  = invoice.charge as Stripe.Charge | null;

              if (charge?.paid) {
                const alreadyRefunded = charge.amount_refunded ?? 0;
                const available       = charge.amount_captured - alreadyRefunded;
                const refundAmount    = Math.min(
                  Math.floor((unusedSeconds / totalSeconds) * charge.amount_captured),
                  available,
                );

                if (refundAmount > 0) {
                  await stripe.refunds.create({
                    charge: charge.id,
                    amount: refundAmount,
                    reason: 'requested_by_customer',
                  });
                  console.log(`[stripe/webhook] Refunded ${refundAmount} pence to ${customerId} for unused subscription time`);
                }
              }
            }
          }
        } catch (refundErr) {
          // Log but don't fail the webhook — DB update must still proceed
          console.error(`[stripe/webhook] Failed to issue cancellation refund for ${customerId}:`, refundErr);
        }

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
