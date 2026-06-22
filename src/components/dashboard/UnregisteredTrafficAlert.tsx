'use client';

import { useState } from 'react';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import Link from 'next/link';

const MAX_CAMPAIGNS = 3;

interface UnregisteredTraffic {
  googleCampaignId: string;
  hitCount: number;
  lastDetected: Date;
}

interface UnregisteredTrafficAlertProps {
  traffic: UnregisteredTraffic[];
  registeredCount: number;
  isViewer?: boolean;
}

export function UnregisteredTrafficAlert({ traffic: initialTraffic, registeredCount, isViewer = false }: UnregisteredTrafficAlertProps) {
  const [traffic, setTraffic] = useState(initialTraffic);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (traffic.length === 0) return null;

  const atLimit = registeredCount >= MAX_CAMPAIGNS;

  const handleConfirmDismiss = async () => {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await fetch('/api/unregistered-traffic', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: confirmId }),
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
          <div className="flex-shrink-0 mt-0.5">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 mb-2">
              Unregistered Traffic Detected
            </h3>

            {atLimit ? (
              <p className="text-sm text-red-800 mb-3">
                We're receiving clicks from {traffic.length} campaign ID{traffic.length !== 1 ? 's' : ''} that{' '}
                {traffic.length === 1 ? "isn't" : "aren't"} registered in your account.
                These clicks are being dropped. You've reached the {MAX_CAMPAIGNS}-campaign limit on the Starter plan —
                remove an existing campaign from Manage Setup first, then register one of these instead.
              </p>
            ) : (
              <p className="text-sm text-red-800 mb-3">
                We're receiving clicks from {traffic.length} campaign ID{traffic.length !== 1 ? 's' : ''} that{' '}
                {traffic.length === 1 ? "isn't" : "aren't"} registered in your account.
                These clicks are being dropped and won't appear in your reports. Register{' '}
                {traffic.length === 1 ? 'it' : 'them'} in Manage Setup to start tracking.
              </p>
            )}

            <div className="bg-white rounded border border-red-200 p-3 mb-3">
              <p className="text-xs font-semibold text-red-900 mb-2">
                Unrecognised Campaign IDs:
              </p>
              <ul className="space-y-1.5">
                {traffic.map((t) => (
                  <li key={t.googleCampaignId} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-red-800">
                      • <span className="font-mono">{t.googleCampaignId}</span>
                      <span className="text-xs text-red-600 ml-2">
                        ({t.hitCount} dropped click{t.hitCount !== 1 ? 's' : ''})
                      </span>
                    </span>
                    <button
                      onClick={() => setConfirmId(t.googleCampaignId)}
                      className="flex-shrink-0 p-0.5 text-red-400 hover:text-red-700 hover:bg-red-100 rounded transition-colors"
                      title="Dismiss this entry"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {!isViewer && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {atLimit ? 'Manage Campaigns' : 'Register These Campaigns'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Remove this entry?</h3>
            <p className="text-sm text-gray-600 mb-1">
              Campaign ID: <span className="font-mono font-medium">{confirmId}</span>
            </p>
            <p className="text-sm text-gray-500 mb-5">
              This will remove it from the dashboard and database. If clicks arrive from this campaign again, it will reappear.
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
                {deleting ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
