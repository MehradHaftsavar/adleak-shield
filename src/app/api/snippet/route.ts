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

      const ingestEndpoint = 'https://adleak-functions-ajbraxdhf4hwgudf.westeurope-01.azurewebsites.net/api/ingest';
      
      const trackingSnippet = generateTrackingSnippet(domain.domain_name, ingestEndpoint);
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

function generateTrackingSnippet(domain: string, endpoint: string): string {
  return `<!-- AdLeak Shield -->
<script>(function(){var e="${endpoint}",d="${domain}";function p(k){var u=new URL(window.location.href);return u.searchParams.get(k)}var params={k:p('keyword'),c:p('campaignid'),a:p('adgroupid'),m:p('matchtype'),g:p('gclid')};if(!params.g||!params.k)return;var s=sessionStorage,sid=s.getItem('als_sid');if(!sid){sid=Date.now()+'-'+Math.random().toString(36).substr(2,9);s.setItem('als_sid',sid)}s.setItem('als_entry',JSON.stringify(params));fetch(e,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventType:'session_start',payload:{session:{sessionFingerprint:sid,keyword:params.k,matchType:params.m,campaignId:params.c,adgroupId:params.a,gclid:params.g,device:/Mobi/.test(navigator.userAgent)?'mobile':'desktop',landedAt:Date.now(),landingPath:location.pathname}},domain:d,ts:Date.now()}),keepalive:true});var ts=Date.now(),hb=setInterval(function(){var n=Date.now();if(document.visibilityState==='visible'){navigator.sendBeacon(e,JSON.stringify({eventType:'heartbeat',payload:{session:{sessionFingerprint:sid,campaignId:params.c},dwellMs:n-ts},domain:d,ts:n}))}},15000);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){clearInterval(hb);navigator.sendBeacon(e,JSON.stringify({eventType:'page_end',payload:{session:{sessionFingerprint:sid,campaignId:params.c},dwellMs:Date.now()-ts},domain:d,ts:Date.now()}))}});window.addEventListener('scroll',function(){var h=document.documentElement,pct=Math.round((h.scrollTop/(h.scrollHeight-h.clientHeight))*100);s.setItem('als_scroll',pct)},false);document.addEventListener('click',function(ev){var t=ev.target;while(t&&t.tagName!=='A'&&t.tagName!=='BUTTON'&&t.parentElement){t=t.parentElement}if(!t||(!t.href&&t.tagName!=='BUTTON'))return;var hr=(t.href||'').toLowerCase();var isConv=hr.indexOf('tel:')===0||hr.indexOf('mailto:')===0||hr.indexOf('wa.me')!==-1||hr.indexOf('api.whatsapp.com')!==-1;navigator.sendBeacon(e,JSON.stringify({eventType:isConv?'success_event':'click',payload:{session:{sessionFingerprint:sid,campaignId:params.c},pagePath:location.pathname.substring(0,500),elementTag:t.tagName.toLowerCase(),elementHref:(t.href||'').substring(0,500)||null},domain:d,ts:Date.now()}))},true);document.addEventListener('submit',function(ev){navigator.sendBeacon(e,JSON.stringify({eventType:'success_event',payload:{session:{sessionFingerprint:sid,campaignId:params.c},pagePath:location.pathname.substring(0,500),elementTag:'form',elementHref:null},domain:d,ts:Date.now()}))},true)})();</script>`;
}

function generateValueTrackTemplate(): string {
  return '{lpurl}?keyword={keyword}&campaignid={campaignid}&matchtype={matchtype}&adgroupid={adgroupid}&gclid={gclid}';
}