'use client';

import { useState } from 'react';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import Link from 'next/link';

interface UnregisteredTraffic {
  googleCampaignId: string;
  domainId:         string | null;
  domainName:       string | null;
  hitCount:         number;
  lastDetected:     Date;
}

interface Campaign {
  id:       string;
  domainId: string;
}

interface UnregisteredTrafficAlertProps {
  traffic:      UnregisteredTraffic[];
  campaigns:    Campaign[];
  maxPerDomain: number;
  isViewer?:    boolean;
}

export function UnregisteredTrafficAlert({
  traffic: initialTraffic,
  campaigns,
  maxPerDomain,
  isViewer = false,
}: UnregisteredTrafficAlertProps) {
  const [traffic, setTraffic] = useState(initialTraffic);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (traffic.length === 0) return null;

  // Count registered campaigns per domain
  const countPerDomain: Record<string, number> = {};
  for (const c of campaigns) {
    countPerDomain[c.domainId] = (countPerDomain[c.domainId] ?? 0) + 1;
  }

  const isDomainFull = (domainId: string | null) =>
    domainId ? (countPerDomain[domainId] ?? 0) >= maxPerDomain : false;

  const handleConfirmDismiss = async () => {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await fetch('/api/unregistered-traffic', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaignId: confirmId }),
      });
      setTraffic(prev => prev.filter(t => t.googleCampaignId !== confirmId));
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  };

  return (
    <>
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 mb-1">
              Clicks from unregistered campaigns detected
            </h3>
            <p className="text-sm text-red-800 mb-3">
              The following campaign IDs are sending clicks to your site but aren't registered —
              those clicks are being dropped and won't appear in your reports.
              {!isViewer && ' Go to Setup to register them.'}
            </p>

            <div className="bg-white rounded border border-red-200 p-3 mb-3 space-y-2">
              {traffic.map((t) => {
                const full = isDomainFull(t.domainId);
                return (
                  <div key={t.googleCampaignId} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm text-red-800 font-mono">{t.googleCampaignId}</span>
                      <span className="text-xs text-red-500 ml-2">
                        ({t.hitCount} dropped click{t.hitCount !== 1 ? 's' : ''})
                      </span>
                      {t.domainName && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          Domain: <span className="font-medium">{t.domainName}</span>
                          {full && (
                            <span className="ml-2 text-red-600 font-medium">
                              — this domain is full ({maxPerDomain}/{maxPerDomain} campaigns).
                              Remove one before registering this.
                            </span>
                          )}
                        </div>
                      )}
                      {!t.domainName && (
                        <div className="text-xs text-gray-400 mt-0.5">Domain not yet identified</div>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmId(t.googleCampaignId)}
                      className="flex-shrink-0 p-0.5 text-red-400 hover:text-red-700 hover:bg-red-100 rounded transition-colors"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {!isViewer && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Go to Setup
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Dismiss this entry?</h3>
            <p className="text-sm text-gray-600 mb-1">
              Campaign ID: <span className="font-mono font-medium">{confirmId}</span>
            </p>
            <p className="text-sm text-gray-500 mb-5">
              This removes it from the dashboard. If clicks from this campaign arrive again it will reappear.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmId(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDismiss}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {deleting ? 'Removing…' : 'Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
