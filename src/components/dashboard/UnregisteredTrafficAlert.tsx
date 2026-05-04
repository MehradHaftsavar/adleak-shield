'use client';

import { AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface UnregisteredTraffic {
  googleCampaignId: string;
  hitCount: number;
  lastDetected: Date;
}

interface UnregisteredTrafficAlertProps {
  traffic: UnregisteredTraffic[];
}

export function UnregisteredTrafficAlert({ traffic }: UnregisteredTrafficAlertProps) {
  if (traffic.length === 0) return null;

  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 mb-2">
            Unregistered Traffic Detected
          </h3>
          <p className="text-sm text-red-800 mb-3">
            We're receiving clicks from {traffic.length} campaign ID{traffic.length !== 1 ? 's' : ''} that 
            {traffic.length === 1 ? " isn't" : " aren't"} registered in your account. 
            These clicks are being dropped and won't appear in your reports.
          </p>
          
          <div className="bg-white rounded border border-red-200 p-3 mb-3">
            <p className="text-xs font-semibold text-red-900 mb-2">
              Unrecognized Campaign IDs:
            </p>
            <ul className="space-y-1">
              {traffic.map((t) => (
                <li key={t.googleCampaignId} className="text-sm text-red-800">
                  • <span className="font-mono">{t.googleCampaignId}</span> 
                  <span className="text-xs text-red-600 ml-2">
                    ({t.hitCount} dropped click{t.hitCount !== 1 ? 's' : ''})
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Register These Campaigns
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}