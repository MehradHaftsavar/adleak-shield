import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  const session = await auth();
  
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await withTenantDb(session.user.tenantId, async (req) => {
      await req.query(`
        UPDATE Tenants 
        SET onboarding_completed = 1, 
            onboarding_completed_at = GETUTCDATE()
        WHERE tenant_id = CAST(SESSION_CONTEXT(N'TenantId') AS uniqueidentifier)
      `);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}