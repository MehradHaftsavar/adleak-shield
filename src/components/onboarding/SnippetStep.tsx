'use client';

import { useState, useEffect } from 'react';
import { Code, Copy, CheckCircle, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';

interface SnippetStepProps {
  domain: string;
  campaigns?: any[];
  onComplete: () => void;
  onBack: () => void;
}

export function SnippetStep({ domain, onComplete, onBack }: SnippetStepProps) {
  const [snippet, setSnippet] = useState('');
  const [template, setTemplate] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Test My Setup state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    loadSnippet();
  }, []);

  const loadSnippet = async () => {
    try {
      const res = await fetch('/api/snippet');
      if (res.ok) {
        const data = await res.json();
        setSnippet(data.snippet);
        setTemplate(data.template);
        setCampaigns(data.campaigns || []);
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

    // Generate test URL with first campaign ID
    const testCampaignId = campaigns[0].id;
    const testUrl = `http://${domain}/?keyword=adleak_test&campaignid=${testCampaignId}&gclid=test_${Date.now()}&matchtype=exact`;

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
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds
    
    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        const res = await fetch('/api/verification/status');
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
            
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Add this code to your website's &lt;head&gt; section:
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
            </div>

            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900">
                <strong>Where to paste:</strong> Add this to the &lt;head&gt; section of every page on {domain}. 
                If you're using WordPress, use a plugin like "Insert Headers and Footers" or add it to your theme's header.php file.
              </p>
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

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Tracking template (applies to all campaigns):
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

            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900 font-semibold mb-2">
                How to add in Google Ads:
              </p>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Go to Google Ads → Settings</li>
                <li>Click "Account settings"</li>
                <li>Scroll to "Tracking" section</li>
                <li>Paste the template into "Tracking template" field</li>
                <li>Click "Save"</li>
              </ol>
              
                <a href="https://support.google.com/google-ads/answer/6305348"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-800 mt-2 font-medium"
              >
                Google Ads help article
                <ExternalLink className="w-3 h-3" />
              </a>
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
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 mb-2">
              ✓ Your Registered Campaigns:
            </h4>
            <ul className="text-sm text-green-800 space-y-1">
              {campaigns.map((campaign, idx) => (
                <li key={idx}>
                  • (ID: {campaign.id})
                </li>
              ))}
            </ul>
          </div>

          {/* Important notes */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-900">
              <strong>⚠️ Important:</strong> Data will only appear in your dashboard once both steps are complete 
              and a visitor clicks one of your ads. The "Live" status indicator will turn green once we receive 
              the first data.
            </p>
          </div>

          {/* Navigation */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={onBack}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              ← Back
            </button>
            <button
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