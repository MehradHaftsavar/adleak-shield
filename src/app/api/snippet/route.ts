import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';

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

      const ingestEndpoint = process.env.NEXT_PUBLIC_INGEST_ENDPOINT || 
                            'https://adleak-functions.azurewebsites.net/api/ingest';
      
      const trackingSnippet = generateTrackingSnippet(session.user.tenantId, ingestEndpoint);
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

function generateTrackingSnippet(tenantId: string, endpoint: string): string {
  return `<!-- AdLeak Shield Tracking Script -->
<script>
(function(){
  var t="${tenantId}",e="${endpoint}";
  function p(k){var u=new URL(window.location.href);return u.searchParams.get(k)}
  function m(i){return i?i.split('.').slice(0,3).join('.')+'.xxx':''}
  var d={k:p('keyword'),c:p('campaignid'),a:p('adgroupid'),m:p('matchtype'),g:p('gclid')};
  if(!d.g||!d.k)return;
  var s=sessionStorage,sid=s.getItem('als_sid');
  if(!sid){sid=Date.now()+'-'+Math.random().toString(36).substr(2,9);s.setItem('als_sid',sid)}
  s.setItem('als_entry',JSON.stringify(d));
  var sess={t:t,sid:sid,k:d.k,c:d.c,a:d.a,m:d.m,g:d.g,url:location.href,ref:document.referrer,dev:/Mobi/.test(navigator.userAgent)?'mobile':'desktop',ip:''};
  fetch(e,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sess),keepalive:true});
  var ts=Date.now(),hb=setInterval(function(){var n=Date.now();if(document.visibilityState==='visible'){navigator.sendBeacon(e,JSON.stringify({t:t,sid:sid,type:'heartbeat',dur:Math.floor((n-ts)/1000)}))}},15000);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')clearInterval(hb)});
  window.addEventListener('scroll',function(){var h=document.documentElement,p=Math.round((h.scrollTop/(h.scrollHeight-h.clientHeight))*100);s.setItem('als_scroll',p)},false);
})();
</script>`.trim();
}

function generateValueTrackTemplate(): string {
  return '{lpurl}?keyword={keyword}&campaignid={campaignid}&matchtype={matchtype}&adgroupid={adgroupid}&gclid={gclid}';
}
