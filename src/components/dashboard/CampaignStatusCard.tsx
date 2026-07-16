'use client';

import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface Campaign {
  id: string;
  googleCampaignId: string;
  slotNumber: number;
  name: string | null;
  domain: string;
  status: string;
  sessionCount: number;
  lastSession: Date | null;
}

interface CampaignStatusCardProps {
  campaign: Campaign;
  hasUnregisteredTraffic?: boolean;
}

export function CampaignStatusCard({ campaign, hasUnregisteredTraffic }: CampaignStatusCardProps) {
  const getStatusDisplay = () => {
    if (hasUnregisteredTraffic) {
      return {
        icon: <AlertCircle className="w-5 h-5 text-red-600" />,
        text: 'Unregistered Traffic Detected',
        color: 'bg-red-50 border-red-200 text-red-700',
      };
    }

    if (campaign.status === 'active' || campaign.sessionCount > 0) {
      return {
        icon: <CheckCircle className="w-5 h-5 text-green-600" />,
        text: 'Active',
        color: 'bg-green-50 border-green-200 text-green-700',
      };
    }

    return {
      icon: <Clock className="w-5 h-5 text-gray-600" />,
      text: 'Awaiting Data',
      color: 'bg-gray-50 border-gray-200 text-gray-700',
    };
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            {campaign.name?.trim() || `Campaign ${campaign.slotNumber}`}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            ID: {campaign.googleCampaignId}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Domain: {campaign.domain}
          </p>
        </div>
        {statusDisplay.icon}
      </div>

      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${statusDisplay.color}`}>
        {statusDisplay.text}
      </div>

      {campaign.sessionCount > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-sm text-gray-600">
            {campaign.sessionCount} session{campaign.sessionCount !== 1 ? 's' : ''} tracked
          </p>
          {campaign.lastSession && (
            <p className="text-xs text-gray-500 mt-1">
              Last: {new Date(campaign.lastSession).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}