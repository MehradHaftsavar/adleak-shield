'use client';

import { useEffect, useState } from 'react';
import { Activity, Settings, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { StatusIndicator } from '@/components/dashboard/StatusIndicator';
import { CampaignStatusCard } from '@/components/dashboard/CampaignStatusCard';
import { UnregisteredTrafficAlert } from '@/components/dashboard/UnregisteredTrafficAlert';
import { LeakTable } from './LeakTable';
import { SessionsTable } from './SessionsTable';
import { DateRangePicker } from './DateRangePicker';

interface DashboardStatus {
  isLive: boolean;
  campaigns: any[];
  unregisteredTraffic: any[];
  hasUnregisteredTraffic: boolean;
}

export function DashboardContent() {
  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Date range state for Leak Table
  const [leakDateRange, setLeakDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
  });

  // Refresh trigger for LeakTable
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleLeakDateChange = (start: string, end: string) => {
    setLeakDateRange({ start, end });
  };

  const handleManualRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      const res = await fetch('/api/dashboard/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setError('');
      } else {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || 'Failed to load dashboard');
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError('Network error - please check your connection');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton */}
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-48 bg-gray-200 rounded"></div>
            <div className="h-48 bg-gray-200 rounded"></div>
            <div className="h-48 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="text-center py-12">
        <div className="mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <Activity className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-red-600 text-lg font-semibold mb-2">
            {error || 'Failed to load dashboard'}
          </p>
          <p className="text-gray-600 text-sm">
            The dashboard data couldn't be loaded. This might be a temporary issue.
          </p>
        </div>
        <button
          onClick={loadStatus}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          {isLoading ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Activity className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor your tracking status</p>
          </div>
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Settings className="w-5 h-5" />
          Manage Setup
        </Link>
      </div>

      {/* Live Status Indicator */}
      <StatusIndicator 
        isLive={status.isLive}
        lastUpdate={status.campaigns[0]?.lastSession}
      />

      {/* Unregistered Traffic Alert */}
      {status.hasUnregisteredTraffic && (
        <UnregisteredTrafficAlert traffic={status.unregisteredTraffic} />
      )}

      {/* Campaign Status Cards */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Campaign Status
        </h2>
        
        {status.campaigns.length === 0 ? (
          <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-600 mb-4">
              No campaigns registered yet
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Your First Campaign
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {status.campaigns.map((campaign) => {
              const hasUnregistered = status.unregisteredTraffic.some(
                t => t.googleCampaignId === campaign.googleCampaignId
              );
              return (
                <CampaignStatusCard
                  key={campaign.id}
                  campaign={campaign}
                  hasUnregisteredTraffic={hasUnregistered}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Leak Table Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Wasted Spend Analysis
          </h2>
          
          <div className="flex items-center justify-center sm:justify-end gap-3">
            <DateRangePicker onRangeChange={handleLeakDateChange} />
            
            {/* Manual Refresh Button */}
            <button
              onClick={handleManualRefresh}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              title="Refresh leak data"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
        
        <LeakTable dateRange={leakDateRange} refreshTrigger={refreshTrigger} />
      </div>

      {/* All Sessions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Visitor Journeys
        </h2>
        <SessionsTable campaigns={status.campaigns} />
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>💡 Tip:</strong> Campaign status changes to "Active" once we receive the first click.
          Use the refresh button to update your leak data manually.
        </p>
      </div>
    </div>
  );
}