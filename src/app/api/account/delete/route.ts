import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withAdminDb } from '@/lib/db/client';
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

    // Cancel Stripe subscription if one exists, before deleting DB records
    try {
      const tenantRow = await withAdminDb(async (req) => {
        const result = await req
          .input('tenantId', mssql.UniqueIdentifier, tenantId)
          .query(`SELECT stripe_customer_id FROM Tenants WHERE tenant_id = @tenantId`);
        return result.recordset[0] ?? null;
      });

      if (tenantRow?.stripe_customer_id) {
        const subscriptions = await stripe.subscriptions.list({
          customer: tenantRow.stripe_customer_id,
          status: 'active',
          limit: 1,
        });
        if (subscriptions.data.length > 0) {
          await stripe.subscriptions.cancel(subscriptions.data[0].id);
        }
      }
    } catch (stripeErr) {
      // Non-fatal — proceed with DB deletion even if Stripe cancel fails
      console.warn('[account/delete] Stripe cancel warning:', stripeErr);
    }

    // Hard delete all tenant data in FK-safe order
    await withAdminDb(async (req) => {
      req.input('tenantId', mssql.UniqueIdentifier, tenantId);

      // 1. Journey events (linked to Sessions)
      await req.query(`DELETE FROM JourneyEvents WHERE tenant_id = @tenantId`);

      // 2. Click logs (linked to Sessions/Campaigns)
      await req.query(`DELETE FROM ClickLogs WHERE tenant_id = @tenantId`);

      // 3. Sessions (linked to Campaigns)
      await req.query(`DELETE FROM Sessions WHERE tenant_id = @tenantId`);

      // 4. Unregistered traffic log
      await req.query(`DELETE FROM UnregisteredTrafficLog WHERE tenant_id = @tenantId`);

      // 5. Campaigns (linked to Domains)
      await req.query(`DELETE FROM Campaigns WHERE tenant_id = @tenantId`);

      // 6. Domains
      await req.query(`DELETE FROM Domains WHERE tenant_id = @tenantId`);

      // 7. Password reset tokens
      await req.query(`DELETE FROM PasswordResetTokens WHERE tenant_id = @tenantId`);

      // 8. Email verification tokens
      await req.query(`DELETE FROM EmailVerificationTokens WHERE tenant_id = @tenantId`);

      // 9. Soft-delete the tenant record — keeps it visible in admin for audit
      //    but strips all personal data for GDPR compliance.
      await req.query(`
        UPDATE Tenants
        SET deleted_at          = GETUTCDATE(),
            email               = CONCAT('deleted_', tenant_id, '@deleted'),
            password_hash       = '',
            subscription_status = 'deleted',
            stripe_customer_id  = NULL
        WHERE tenant_id = @tenantId
      `);
    });

    console.log(`[account/delete] Tenant ${tenantId} fully deleted.`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[account/delete] Error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
