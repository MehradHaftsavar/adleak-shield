import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAdminPool } from '@/lib/db/client';
import { stripe } from '@/lib/stripe';
import * as mssql from 'mssql';

export const dynamic = 'force-dynamic';

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const tenantId = session.user.tenantId as string;

    // -------------------------------------------------------------------------
    // Step 1: Read stripe_customer_id BEFORE touching anything
    // -------------------------------------------------------------------------
    const pool = await getAdminPool();
    const tenantRow = await pool.request()
      .input('tenantId', mssql.UniqueIdentifier, tenantId)
      .query(`SELECT stripe_customer_id FROM Tenants WHERE tenant_id = @tenantId AND deleted_at IS NULL`);

    const stripeCustomerId = tenantRow.recordset[0]?.stripe_customer_id ?? null;

    // -------------------------------------------------------------------------
    // Step 2: Delete all data in a single transaction — all-or-nothing.
    //         If anything fails here the user's account is untouched and they
    //         can retry. Stripe is NOT touched yet.
    // -------------------------------------------------------------------------
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();

    try {
      const req = new mssql.Request(transaction);
      req.input('tenantId', mssql.UniqueIdentifier, tenantId);

      // FK-safe deletion order
      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`DELETE FROM JourneyEvents WHERE tenant_id = @tenantId`);

      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`DELETE FROM ClickLogs WHERE tenant_id = @tenantId`);

      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`DELETE FROM Sessions WHERE tenant_id = @tenantId`);

      // UnregisteredTrafficLog has no tenant_id — join via Campaigns
      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          DELETE FROM UnregisteredTrafficLog
          WHERE unrecognised_campaign_id IN (
            SELECT google_campaign_id FROM Campaigns WHERE tenant_id = @tenantId
          )
        `);

      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`DELETE FROM Campaigns WHERE tenant_id = @tenantId`);

      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`DELETE FROM Domains WHERE tenant_id = @tenantId`);

      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`DELETE FROM PasswordResetTokens WHERE tenant_id = @tenantId`);

      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`DELETE FROM EmailVerificationTokens WHERE tenant_id = @tenantId`);

      // Soft-delete the Tenants row — strips PII, keeps row for admin audit trail
      await new mssql.Request(transaction)
        .input('tenantId', mssql.UniqueIdentifier, tenantId)
        .query(`
          UPDATE Tenants
          SET deleted_at          = GETUTCDATE(),
              email               = CONCAT('deleted_', tenant_id, '@deleted'),
              password_hash       = '',
              subscription_status = 'canceled',
              stripe_customer_id  = NULL
          WHERE tenant_id = @tenantId
        `);

      await transaction.commit();
      console.log(`[account/delete] DB transaction committed for tenant ${tenantId}`);
    } catch (dbErr) {
      await transaction.rollback();
      console.error('[account/delete] DB transaction rolled back:', dbErr);
      throw dbErr; // surfaces as 500 — account is fully intact, user can retry
    }

    // -------------------------------------------------------------------------
    // Step 3: Cancel Stripe subscription AFTER the DB is clean.
    //         Non-fatal — if this fails the account is still deleted in DB.
    //         The subscription will fail to renew naturally, and the webhook
    //         won't overwrite the 'deleted' status (deleted_at IS NULL guard).
    // -------------------------------------------------------------------------
    if (stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'active',
          limit: 1,
        });
        if (subscriptions.data.length > 0) {
          await stripe.subscriptions.cancel(subscriptions.data[0].id);
          console.log(`[account/delete] Stripe subscription cancelled for ${stripeCustomerId}`);
        }
      } catch (stripeErr) {
        // Log but don't fail — DB is already clean, subscription will lapse
        console.warn('[account/delete] Stripe cancel warning (non-fatal):', stripeErr);
      }
    }

    console.log(`[account/delete] Tenant ${tenantId} fully deleted.`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[account/delete] Error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
