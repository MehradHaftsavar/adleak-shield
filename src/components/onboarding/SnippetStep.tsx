'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Code, Copy, CheckCircle, ExternalLink, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

function Accordion({ title, children, defaultOpen = false }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>
      {open && <div className="px-4 py-4 bg-white border-t border-gray-200">{children}</div>}
    </div>
  );
}

interface SnippetStepProps {
  domain: string;
  campaigns?: any[];
  onComplete: () => void;
  onBack: () => void;
}

export function SnippetStep({ domain, onComplete, onBack }: SnippetStepProps) {
  const { data: session } = useSession();
  const [snippet, setSnippet] = useState('');
  const [template, setTemplate] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  // Maps domainId → workspaceTenantId (null = own workspace)
  const [domainWorkspaceMap, setDomainWorkspaceMap] = useState<Record<string, string | null>>({});
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Test My Setup state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [testProtocol, setTestProtocol] = useState<'https' | 'http'>('https');
  const [testDomainId, setTestDomainId] = useState('');
  const [testCampaignDbId, setTestCampaignDbId] = useState('');

  useEffect(() => {
    loadSnippet();
  }, []);

  const loadSnippet = async () => {
    try {
      // Snippet code — may fail if user has no own domains; that's fine, snippet is generic
      const snippetRes = await fetch('/api/snippet');
      if (snippetRes.ok) {
        const data = await snippetRes.json();
        setSnippet(data.snippet);
        setTemplate(data.template);
      } else {
        // No own domain — still show the generic snippet code
        setSnippet('<!-- AdLeak Shield -->\n<script src="https://www.adleakshield.com/tracker.js" defer></script>');
        setTemplate('{lpurl}?keyword={keyword}&campaignid={campaignid}&matchtype={matchtype}&adgroupid={adgroupid}&adid={creative}&adposition={adposition}&gclid={gclid}');
      }

      // Own campaigns
      const allCampaigns: any[] = [];
      const workspaceMap: Record<string, string | null> = {};

      const ownRes = await fetch('/api/campaigns');
      if (ownRes.ok) {
        const data = await ownRes.json();
        for (const c of (data.campaigns ?? [])) {
          allCampaigns.push(c);
          workspaceMap[c.domainId] = null;
        }
      }

      // Invited workspace campaigns
      const allAccessible = (session?.user?.allAccessibleDomains ?? []) as Array<{
        tenantId: string; domainId: string; role: string; tenantOwnerEmail: string;
      }>;
      const ownTenantId = session?.user?.tenantId;
      const invitedTenantIds = [...new Set(
        allAccessible.filter(d => d.tenantId !== ownTenantId).map(d => d.tenantId)
      )];

      await Promise.all(invitedTenantIds.map(async (tenantId) => {
        try {
          const res = await fetch(`/api/campaigns?workspace=${tenantId}`);
          if (res.ok) {
            const data = await res.json();
            for (const c of (data.campaigns ?? [])) {
              allCampaigns.push(c);
              workspaceMap[c.domainId] = tenantId;
            }
          }
        } catch { /* non-fatal */ }
      }));

      setCampaigns(allCampaigns);
      setDomainWorkspaceMap(workspaceMap);
      if (allCampaigns.length > 0) {
        setTestDomainId(allCampaigns[0].domainId);
        setTestCampaignDbId(allCampaigns[0].googleCampaignId);
      }
    } catch (err) {
      console.error('Failed to load snippet:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'snippet' | 'template') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'snippet') {
        setSnippetCopied(true);
        setTimeout(() => setSnippetCopied(false), 2000);
      } else {
        setTemplateCopied(true);
        setTimeout(() => setTemplateCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleTestSetup = async () => {
    if (campaigns.length === 0) {
      setTestMessage('Please add at least one campaign first');
      setTestResult('failed');
      return;
    }

    setIsTesting(true);
    setTestResult('testing');
    setTestMessage('Opening test page...');

    const selectedCampaign = campaigns.find((c: any) => c.googleCampaignId === testCampaignDbId) ?? campaigns[0];
    const selectedDomain = campaigns.find((c: any) => c.domainId === testDomainId) ?? campaigns[0];
    const testDomainName = selectedDomain?.domainName ?? domain;
    const testCampaignId = selectedCampaign?.googleCampaignId ?? campaigns[0]?.googleCampaignId;
    const testUrl = `${testProtocol}://${testDomainName}/?keyword=adleak_test&campaignid=${testCampaignId}&adgroupid=test_group_001&adid=test_ad_001&adposition=1t1&gclid=test_${Date.now()}&matchtype=exact`;

    // Open test URL in new tab
    const testWindow = window.open(testUrl, '_blank');

    if (!testWindow) {
      setTestMessage('Pop-up blocked! Please allow pop-ups and try again.');
      setTestResult('failed');
      setIsTesting(false);
      return;
    }

    setTestMessage('Test page opened. Waiting for tracking data...');

    // Poll for verification (check every 2 seconds for 30 seconds)
    const testWorkspace = domainWorkspaceMap[testDomainId] ?? null;
    const verifyUrl = testWorkspace
      ? `/api/verification/status?workspace=${testWorkspace}`
      : '/api/verification/status';

    let attempts = 0;
    const maxAttempts = 15; // 30 seconds

    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        const res = await fetch(verifyUrl);
        if (res.ok) {
          const data = await res.json();
          
          if (data.snippetInstalled) {
            // Success!
            clearInterval(pollInterval);
            setTestResult('success');
            setTestMessage('✓ Snippet is working! Tracking data received successfully.');
            setIsTesting(false);
            return;
          }
        }

        // Update message with countdown
        const secondsRemaining = (maxAttempts - attempts) * 2;
        setTestMessage(`Waiting for tracking data... (${secondsRemaining}s remaining)`);

        // Timeout
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setTestResult('failed');
          setTestMessage('No tracking data received. See troubleshooting below.');
          setIsTesting(false);
        }
      } catch (err) {
        console.error('Verification poll error:', err);
      }
    }, 2000);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
          <Code className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Install Tracking</h2>
          <p className="text-gray-600 mt-1">
            Add the snippet to your website and configure Google Ads
          </p>
        </div>
      </div>

      {/* Merchant privacy obligations notice — collapsible */}
      <div className="mb-6">
        <Accordion title={<span className="flex items-center gap-2"><span>⚖️</span> Privacy obligations — read before going live</span>}>
          <div className="text-sm text-amber-900 space-y-2">
            <p>
              By installing this snippet, you become a <strong>data controller</strong> for your visitors' data under UK/EU GDPR.
              Before going live you must:
            </p>
            <ul className="list-disc list-inside ml-1 space-y-0.5 text-amber-800">
              <li>Add AdLeak Shield to your website's <strong>Privacy Policy</strong></li>
              <li>Ensure you have a lawful basis for collecting visitor analytics (legitimate interest is common)</li>
              <li>If you use a consent/cookie banner, configure it to load this snippet only for consenting visitors</li>
            </ul>
            <p className="text-xs text-amber-700">
              Full details in our{' '}
              <a href="/terms#merchant" target="_blank" rel="noopener noreferrer" className="underline font-medium">Terms of Service (Section 6)</a>
              {' '}and{' '}
              <a href="/privacy#merchant" target="_blank" rel="noopener noreferrer" className="underline font-medium">Privacy Policy (Section 8)</a>.
            </p>
          </div>
        </Accordion>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Generating your tracking code...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Step 1: Install JS Snippet */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full text-sm">
                1
              </span>
              Install Tracking Snippet on Your Website
            </h3>
            
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  Paste into the <code className="bg-gray-200 px-1 rounded">&lt;head&gt;</code> of every page on <strong>{domain}</strong>:
                </p>
                <button
                  onClick={() => copyToClipboard(snippet, 'snippet')}
                  className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
                >
                  {snippetCopied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Code
                    </>
                  )}
                </button>
              </div>

              <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto text-xs">
                <code>{snippet}</code>
              </pre>

              {/* Platform-specific links */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-xs text-gray-500 font-medium">Platform guides:</span>
                {[
                  { label: 'WordPress',  hash: 'wordpress' },
                  { label: 'Shopify',    hash: 'shopify' },
                  { label: 'Wix',        hash: 'wix' },
                  { label: 'Hand-coded', hash: 'html' },
                ].map(({ label, hash }) => (
                  <a
                    key={hash}
                    href={`/setup-guide#${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-full hover:bg-purple-100 transition-colors"
                  >
                    {label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>

            {/* CSP — collapsible, closed by default */}
            <div className="mt-3">
              <Accordion title="🔒 Using a Content Security Policy (CSP)? — click to expand">
                <div className="text-sm text-gray-600 space-y-2">
                  <p>Most websites don't use CSP — if you're not sure, skip this. If you do, add these two lines:</p>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
                    <code>{`script-src 'self' https://adleakshield.com;\nconnect-src 'self' https://adleak-functions-ajbraxdhf4hwgudf.westeurope-01.azurewebsites.net;`}</code>
                  </pre>
                </div>
              </Accordion>
            </div>
          </div>

          {/* Step 2: Configure Google Ads */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full text-sm">
                2
              </span>
              Add ValueTrack Template to Google Ads
            </h3>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  Add to each campaign's tracking template in Google Ads:
                </p>
                <button
                  onClick={() => copyToClipboard(template, 'template')}
                  className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
                >
                  {templateCopied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Template
                    </>
                  )}
                </button>
              </div>

              <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto text-xs">
                <code>{template}</code>
              </pre>
            </div>

            {/* Step-by-step Google Ads instructions — collapsible */}
            <div className="mt-3">
              <Accordion title="How to add this template in Google Ads — step by step">
                <div className="space-y-3">
                  <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside ml-1">
                    <li>Sign in to your Google Ads account</li>
                    <li>Click <strong>Campaigns</strong> in the left menu</li>
                    <li>Select your campaign (the one you registered above)</li>
                    <li>Click the <strong>Settings</strong> tab</li>
                    <li>Scroll down to <strong>Other settings</strong></li>
                    <li>Click <strong>Campaign URL options</strong></li>
                    <li>In the <strong>Tracking template</strong> field, paste the template above</li>
                    <li>Click <strong>Save</strong></li>
                  </ol>
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-900">
                    <strong>⚠️ Important:</strong> Add the template at the <strong>campaign level</strong>, not account or ad level. Repeat for each campaign you registered.
                  </div>
                  <p className="text-sm text-gray-600">
                    <strong>📌 Multiple ads in the same campaign?</strong> No problem — all ads in a campaign share the same template. Add it once per campaign, not per ad.
                  </p>
                  <a
                    href="https://support.google.com/google-ads/answer/6305348"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-800 font-medium"
                  >
                    Google Ads official help article
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </Accordion>
            </div>
          </div>

          {/* Test My Setup Button */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full text-sm">
                3
              </span>
              Test Your Setup
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              Click the button below to verify your tracking snippet is installed correctly.
              This will open your website with test parameters and check if we receive the data.
            </p>

            {/* Domain + campaign selectors */}
            {campaigns.length > 0 && (() => {
              const uniqueDomains = Array.from(
                new Map(campaigns.map((c: any) => [c.domainId, { domainId: c.domainId, domainName: c.domainName }])).values()
              );
              const campaignsForDomain = campaigns.filter((c: any) => c.domainId === testDomainId);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Test domain</label>
                    <select
                      value={testDomainId}
                      onChange={e => {
                        setTestDomainId(e.target.value);
                        const first = campaigns.find((c: any) => c.domainId === e.target.value);
                        if (first) setTestCampaignDbId(first.googleCampaignId);
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      {uniqueDomains.map((d: any) => (
                        <option key={d.domainId} value={d.domainId}>{d.domainName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Test campaign</label>
                    <select
                      value={testCampaignDbId}
                      onChange={e => setTestCampaignDbId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    >
                      {campaignsForDomain.map((c: any) => (
                        <option key={c.id} value={c.googleCampaignId}>
                          Campaign {c.slotNumber} ({c.googleCampaignId})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-gray-600 font-medium">My site uses:</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
                <button
                  type="button"
                  onClick={() => setTestProtocol('https')}
                  className={`px-4 py-1.5 transition-colors ${testProtocol === 'https' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  HTTPS
                </button>
                <button
                  type="button"
                  onClick={() => setTestProtocol('http')}
                  className={`px-4 py-1.5 border-l border-gray-200 transition-colors ${testProtocol === 'http' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  HTTP
                </button>
              </div>
              <span className="text-xs text-gray-400">
                {testProtocol === 'https' ? 'Most sites — recommended' : 'Only if your site has no SSL certificate'}
              </span>
            </div>

            <button
              onClick={handleTestSetup}
              disabled={isTesting || campaigns.length === 0}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Test My Setup
                </>
              )}
            </button>

            {/* Test Result */}
            {testResult !== 'idle' && (
              <div className={`mt-4 p-4 rounded-lg border-2 ${
                testResult === 'success' 
                  ? 'bg-green-50 border-green-300'
                  : testResult === 'failed'
                  ? 'bg-red-50 border-red-300'
                  : 'bg-blue-50 border-blue-300'
              }`}>
                <div className="flex items-start gap-3">
                  {testResult === 'success' && <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />}
                  {testResult === 'failed' && <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />}
                  {testResult === 'testing' && <Loader2 className="w-6 h-6 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />}
                  
                  <div className="flex-1">
                    <p className={`font-medium ${
                      testResult === 'success' ? 'text-green-900' :
                      testResult === 'failed' ? 'text-red-900' :
                      'text-blue-900'
                    }`}>
                      {testMessage}
                    </p>

                    {/* Troubleshooting for failures */}
                    {testResult === 'failed' && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-semibold text-red-900">Troubleshooting:</p>
                        <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                          <li>Make sure you pasted the snippet in the &lt;head&gt; section</li>
                          <li>Clear your browser cache and try again</li>
                          <li>Check browser console (F12) for errors</li>
                          <li>Verify the domain "{domain}" is correct</li>
                          <li>Make sure your website is accessible at http://{domain}</li>
                        </ul>
                        <button
                          onClick={handleTestSetup}
                          className="mt-2 text-sm text-red-700 hover:text-red-800 font-medium underline"
                        >
                          Try Again
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Campaign summary */}
          <Accordion title={`✓ Your Registered Campaigns (${campaigns.length})`}>
            <ul className="text-sm text-green-800 space-y-1">
              {campaigns.map((campaign: any, idx: number) => (
                <li key={idx}>
                  • {campaign.name ?? `Campaign ${campaign.slotNumber ?? idx + 1}`} — Google ID: {campaign.googleCampaignId ?? campaign.id} ({campaign.domainName ?? ''})
                </li>
              ))}
            </ul>
          </Accordion>

          {/* What happens next — collapsible, merges the "Important" warning */}
          <Accordion title="🚀 What to expect on the dashboard — click to expand">
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-900">
                <strong>⚠️ Heads up:</strong> The dashboard will look empty at first — that's normal. Data only appears once both steps above are complete and a real visitor clicks one of your ads.
              </div>
              <ol className="space-y-3">
                <li className="flex gap-3 text-sm text-gray-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">1</span>
                  <div>
                    <span className="font-medium">Dashboard starts empty</span> — sessions and leak data only appear once real Google Ads clicks come through with the ValueTrack parameters active.
                  </div>
                </li>
                <li className="flex gap-3 text-sm text-gray-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">2</span>
                  <div>
                    <span className="font-medium">The Live indicator turns green</span> the moment we receive your first tracked session — usually within seconds of a real ad click.
                  </div>
                </li>
                <li className="flex gap-3 text-sm text-gray-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">3</span>
                  <div>
                    <span className="font-medium">Leak Table fills up over time.</span> Keywords only appear if they have a high bounce rate — if it stays empty, your campaigns are performing well (that's a good thing!).
                  </div>
                </li>
                <li className="flex gap-3 text-sm text-gray-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">4</span>
                  <div>
                    <span className="font-medium">Nothing after 24 hours?</span> Check the All Sessions tab — if sessions appear there but not in Leak Table, your keywords are performing well. If sessions are also empty, recheck your snippet and ValueTrack template.
                  </div>
                </li>
              </ol>
            </div>
          </Accordion>

          {/* Navigation */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={onBack}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Dashboard →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}