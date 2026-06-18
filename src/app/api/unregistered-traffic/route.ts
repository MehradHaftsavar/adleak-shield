import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import * as mssql from 'mssql';
import { getEffectiveTenantId } from '@/lib/adminAuth';

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId } = await getEffectiveTenantId(
      session.user.tenantId as string,
      session.user.isOwner as boolean
    );

    const body = await request.json();
    const campaignId = body?.campaignId as string | undefined;

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    await withTenantDb(tenantId, async (req) => {
      await req
        .input('campaignId', mssql.NVarChar, campaignId.substring(0, 20))
        .query(`DELETE FROM UnregisteredTrafficLog WHERE unrecognised_campaign_id = @campaignId`);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete unregistered traffic error:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}
