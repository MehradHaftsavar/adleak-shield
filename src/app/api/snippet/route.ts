import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';

// Uses auth()/headers() — always request-time. Declaring this stops Next from
// attempting a build-time prerender probe (which threw DYNAMIC_SERVER_USAGE).
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Check domain registered (RLS auto-filters)
      const domainResult = await req.query(`SELECT domain_name FROM Domains`);
      const domain = domainResult.recordset?.[0];

      if (!domain) {
        throw new Error('DOMAIN_REQUIRED');
      }

      // Fetch registered campaigns
      const campaignsResult = await req.query(`
        SELECT google_campaign_id, slot_number
        FROM Campaigns
        ORDER BY slot_number
      `);

      const campaigns = (campaignsResult.recordset || []).map(c => ({
        id: c.google_campaign_id,
        slot: c.slot_number,
      }));

      const trackingSnippet = generateTrackingSnippet();
      const valueTrackTemplate = generateValueTrackTemplate();

      return {
        snippet: trackingSnippet,
        template: valueTrackTemplate,
        domain: domain.domain_name,
        campaigns,
        tenantId: session.user.tenantId,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Get snippet error:', error);
    
    if (error instanceof Error && error.message === 'DOMAIN_REQUIRED') {
      return NextResponse.json({ error: 'Please register your domain first' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to generate tracking snippet' }, { status: 500 });
  }
}

function generateTrackingSnippet(): string {
  return `<!-- AdLeak Shield -->\n<script src="https://www.adleakshield.com/tracker.js" defer></script>`;
}

function generateValueTrackTemplate(): string {
  return '{lpurl}?keyword={keyword}&campaignid={campaignid}&matchtype={matchtype}&adgroupid={adgroupid}&adid={creative}&adposition={adposition}&gclid={gclid}';
}