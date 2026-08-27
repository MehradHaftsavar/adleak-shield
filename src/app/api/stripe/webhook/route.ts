import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { withAdminDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getPlanFromPriceId } from '@/lib/planLimits';

export const dynamic = 'force-dynamic';

// =============================================================================
// TENANT MATCHING
//
// Stripe delivers webhook events in PARALLEL with no ordering guarantee. That
// broke a real subscription on 27 Aug 2026: customer.subscription.updated was
// delivered at 08:57:56 and customer.subscription.created at 08:57:57 — one
// second later. The card needed a 3DS challenge, so the subscription was
// created 'incomplete'; the created handler therefore only stored the customer
// ID and left the status alone. But the updated handler, which carried the
// 'active' status, had already run and matched on stripe_customer_id — a column
// the created event had not written yet. It updated ZERO rows, logged success,
// and the tenant sat on 'trialing' while Stripe billed them monthly.
//
// The fix is not to control ordering (impossible) but to remove the dependency:
// every subscription event carries the tenant in its own metadata, stamped by
// the checkout route, so a handler can identify the tenant from the payload
// alone. Order then stops mattering because no handler depends on another
// handler having run first.
//
// The stripe_customer_id match stays as a fallback for subscriptions created
// before that metadata existed, or outside the checkout flow.
// =============================================================================
type TenantMatch = { column: 'tenant_id' | 'stripe_customer_id'; value: string };

function matchForSubscription(sub: Stripe.Subscription): TenantMatch {
  const tenantId = sub.metadata?.tenantId;
  return tenantId
    ? { column: 'tenant_id',         value: tenantId }
    : { column: 'stripe_customer_id', value: sub.customer as string };
}

/**
 * Run a Tenants UPDATE and report when it matched nothing.
 *
 * Every UPDATE in this file used to look identical whether it changed a row or
 * silently changed none — which is exactly why the bug above went unnoticed
 * until a customer complained. A zero-row update means the DB is now out of
 * sync with Stripe, so it is logged as an error for alerting.
 *
 * Deliberately does NOT throw: a 500 makes Stripe retry the whole event, which
 * for customer.subscription.deleted would re-enter the refund logic.
 */
async function updateTenant(
  match:      TenantMatch,
  setClause:  string,
  bind:       (req: mssql.Request) => void,
  context:    string,
): Promise<number> {
  return withAdminDb(async (req) => {
    if (match.column === 'tenant_id') {
      req.input('matchValue', mssql.UniqueIdentifier, match.value);
    } else {
      req.input('matchValue', mssql.NVarChar(50), match.value);
    }
    bind(req);

    const result = await req.query(`
      UPDATE Tenants
      SET ${setClause}
      WHERE ${match.column} = @matchValue
        AND deleted_at IS NULL
    `);

    const rows = result.rowsAffected[0] ?? 0;
    if (rows === 0) {
      console.error(
        `[stripe/webhook] NO ROWS UPDATED — ${context}. Matched on ` +
        `${match.column}=${match.value}. Tenant is now OUT OF SYNC with Stripe.`
      );
    }
    return rows;
  });
}

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

        // Derive plan from the subscription's price ID so activation never leaves
        // a stale plan_type behind (e.g. a prior trial's plan). Prefer the metadata
        // plan when present, falling back to the price-ID mapping.
        const createdPriceId = subscription.items.data[0]?.price?.id ?? '';
        const createdPlan = (subscription.metadata?.plan
          ?? (createdPriceId ? getPlanFromPriceId(createdPriceId) : 'starter')) as string;

        // Always store stripe_customer_id so customer.subscription.updated
        // can find the tenant by customerId even if status starts as 'incomplete'.
        if (subscription.status === 'active') {
          await updateTenant(
            { column: 'tenant_id', value: tenantId },
            `stripe_customer_id        = @customerId,
             subscription_status       = 'active',
             plan_type                 = @planType,
             subscription_cancelled_at = NULL,
             data_deletion_warned_at   = NULL`,
            (req) => {
              req
                .input('customerId', mssql.NVarChar(50), customerId)
                .input('planType',   mssql.NVarChar(20), createdPlan);
            },
            `subscription.created → active for tenant ${tenantId}`,
          );
          console.log(`[stripe/webhook] Tenant ${tenantId} activated via subscription.created, plan=${createdPlan}`);
        } else {
          // Not active yet (e.g. incomplete while a 3DS challenge completes) —
          // just store the customer ID. Zero rows here is NORMAL and not logged
          // as an error: customer.subscription.updated may already have stored
          // it, and the guard below deliberately makes this a no-op if so.
          await withAdminDb(async (req) => {
            await req
              .input('customerId', mssql.NVarChar(50), customerId)
              .input('tenantId',   mssql.UniqueIdentifier, tenantId)
              .query(`
                UPDATE Tenants
                SET stripe_customer_id = @customerId
                WHERE tenant_id = @tenantId AND (stripe_customer_id IS NULL OR stripe_customer_id = '')
              `);
          });
          console.log(`[stripe/webhook] Tenant ${tenantId} customer ID stored, status=${subscription.status}`);
        }
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

        await updateTenant(
          { column: 'tenant_id', value: tenantId },
          `stripe_customer_id        = @customerId,
           subscription_status       = 'active',
           plan_type                 = @planType,
           subscription_cancelled_at = NULL,
           data_deletion_warned_at   = NULL`,
          (req) => {
            req
              .input('customerId', mssql.NVarChar(50), customerId)
              .input('planType',   mssql.NVarChar(20), plan);
          },
          `checkout.session.completed for tenant ${tenantId}`,
        );

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

        // Identify the tenant from the event's own metadata where possible, so
        // this handler never depends on another event having run first.
        const match = matchForSubscription(subscription);

        // Writing stripe_customer_id on every path means that even when this
        // event wins the race against customer.subscription.created, the column
        // is populated for any later event that can only match on it.
        const bindCustomer = (req: mssql.Request) =>
          req.input('customerId', mssql.NVarChar(50), customerId);

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
            await updateTenant(
              match,
              `subscription_status       = 'active',
               plan_type                 = @planType,
               stripe_customer_id        = @customerId,
               subscription_cancelled_at = NULL,
               data_deletion_warned_at   = NULL`,
              (req) => { bindCustomer(req).input('planType', mssql.NVarChar(20), otherPlan); },
              `cancel event superseded by another active sub for ${customerId}`,
            );
            console.log(`[stripe/webhook] Cancel event for ${customerId} ignored — another active sub exists (plan=${otherPlan})`);
            break;
          }
        }

        if (isCanceled) {
          await updateTenant(
            match,
            `subscription_status       = @status,
             stripe_customer_id        = @customerId,
             subscription_cancelled_at = ISNULL(subscription_cancelled_at, GETUTCDATE()),
             data_deletion_warned_at   = NULL`,
            (req) => { bindCustomer(req).input('status', mssql.NVarChar(20), mappedStatus); },
            `subscription.updated → canceled for ${customerId}`,
          );
        } else if (isActive) {
          await updateTenant(
            match,
            `subscription_status       = @status,
             plan_type                 = @planType,
             stripe_customer_id        = @customerId,
             subscription_cancelled_at = NULL,
             data_deletion_warned_at   = NULL`,
            (req) => {
              bindCustomer(req)
                .input('status',   mssql.NVarChar(20), mappedStatus)
                .input('planType', mssql.NVarChar(20), planType);
            },
            `subscription.updated → active for ${customerId}`,
          );
        } else {
          await updateTenant(
            match,
            `subscription_status = @status,
             plan_type           = @planType,
             stripe_customer_id  = @customerId`,
            (req) => {
              bindCustomer(req)
                .input('status',   mssql.NVarChar(20), mappedStatus)
                .input('planType', mssql.NVarChar(20), planType);
            },
            `subscription.updated → ${mappedStatus} for ${customerId}`,
          );
        }

        console.log(`[stripe/webhook] Subscription updated for ${customerId} (matched on ${match.column}): ${subscription.status} → ${mappedStatus}, plan=${planType}`);
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
          await updateTenant(
            matchForSubscription(subscription),
            `subscription_status       = 'active',
             plan_type                 = @planType,
             subscription_cancelled_at = NULL,
             data_deletion_warned_at   = NULL`,
            (req) => { req.input('planType', mssql.NVarChar(20), otherPlan); },
            `delete event superseded by another active sub for ${customerId}`,
          );
          console.log(`[stripe/webhook] Delete event for ${customerId} ignored — another active sub exists (plan=${otherPlan})`);
          break;
        }

        // Issue a prorated refund for the unused portion of the paid period.
        // IMPORTANT: an immediate cancellation truncates subscription.current_period_end
        // to the cancel time, which would zero out the proration. So we derive the
        // ORIGINAL period from the paid invoice's line item instead.
        try {
          const invoiceId = typeof subscription.latest_invoice === 'string'
            ? subscription.latest_invoice
            : (subscription.latest_invoice as Stripe.Invoice | null)?.id;

          if (!invoiceId) {
            console.log(`[stripe/webhook] Refund skipped for ${customerId}: subscription has no latest_invoice`);
          } else {
            // ⚠ API VERSION TRAP — do not bump apiVersion without rewriting this.
            // `invoice.charge` was REMOVED from the Invoice object in Stripe API
            // version 2025-03-31.basil (along with payment_intent / paid). This
            // still works only because src/lib/stripe.ts pins '2024-06-20', and
            // SDK calls use that pinned version regardless of the newer version
            // the webhook EVENT arrives in. Raise the pin past 2025-03-31 and
            // `charge` becomes undefined — the catch below swallows it, so
            // cancelling customers would silently stop receiving refunds.
            // The replacement is expanding payments.data.payment.payment_intent.
            const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['charge'] });
            const charge  = invoice.charge as Stripe.Charge | null;

            if (!charge?.paid) {
              console.log(`[stripe/webhook] Refund skipped for ${customerId}: invoice ${invoiceId} has no paid charge`);
            } else {
              // Prefer the subscription line item's period (the true billing window
              // that was paid for); fall back to the invoice-level period.
              const line        = invoice.lines?.data?.[0];
              const periodStart = line?.period?.start ?? invoice.period_start;
              const periodEnd   = line?.period?.end   ?? invoice.period_end;
              const canceledAt  = subscription.canceled_at ?? Math.floor(Date.now() / 1000);

              const totalSeconds  = periodEnd - periodStart;
              const unusedSeconds = periodEnd - canceledAt;

              if (totalSeconds <= 0 || unusedSeconds <= 0) {
                console.log(`[stripe/webhook] Refund skipped for ${customerId}: no unused time (period ${periodStart}→${periodEnd}, canceledAt ${canceledAt})`);
              } else {
                const alreadyRefunded = charge.amount_refunded ?? 0;
                const available       = charge.amount_captured - alreadyRefunded;
                const refundAmount    = Math.min(
                  Math.floor((unusedSeconds / totalSeconds) * charge.amount_captured),
                  available,
                );

                if (refundAmount <= 0) {
                  console.log(`[stripe/webhook] Refund skipped for ${customerId}: computed amount 0 (captured ${charge.amount_captured}, alreadyRefunded ${alreadyRefunded}, unused ${unusedSeconds}/${totalSeconds}s)`);
                } else {
                  await stripe.refunds.create({
                    charge: charge.id,
                    amount: refundAmount,
                    reason: 'requested_by_customer',
                  });
                  console.log(`[stripe/webhook] Refunded ${refundAmount} pence to ${customerId} (unused ${unusedSeconds}/${totalSeconds}s of paid period)`);
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
        await updateTenant(
          matchForSubscription(subscription),
          `subscription_status       = 'canceled',
           subscription_cancelled_at = ISNULL(subscription_cancelled_at, GETUTCDATE()),
           data_deletion_warned_at   = NULL`,
          () => {},
          `subscription.deleted for ${customerId}`,
        );

        console.log(`[stripe/webhook] Subscription deleted for ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await updateTenant(
          { column: 'stripe_customer_id', value: customerId },
          `subscription_status = 'past_due'`,
          () => {},
          `invoice.payment_failed for ${customerId}`,
        );

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
