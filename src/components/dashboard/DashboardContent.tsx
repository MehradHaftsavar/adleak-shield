'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Activity, Settings, Plus, RefreshCw, CheckCircle, CreditCard } from 'lucide-react';
import { StatusIndicator } from '@/components/dashboard/StatusIndicator';
import { CampaignStatusCard } from '@/components/dashboard/CampaignStatusCard';
import { UnregisteredTrafficAlert } from '@/components/dashboard/UnregisteredTrafficAlert';
import { LeakTable } from './LeakTable';
import { SessionsTable } from './SessionsTable';
import { DateRangePicker } from './DateRangePicker';
import PaywallOverlay from './PaywallOverlay';

interface DashboardStatus {
  isLive: boolean;
  campaigns: any[];
  unregisteredTraffic: any[];
  hasUnregisteredTraffic: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  isPaywalled: boolean;
  daysLeftInTrial: number | null;
}

export function DashboardContent() {
  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { update: updateSession } = useSession();

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
    setLeakDateRange(prev => ({ ...prev, end: new Date().toISOString() }));
    setRefreshTrigger(prev => prev + 1);
  };

  const handleUpgrade = useCallback(async () => {
    setUpgrading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setUpgrading(false);
    }
  }, []);

  const [portalLoading, setPortalLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const handlePortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setPortalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setPaymentSuccess(true);
      router.replace('/dashboard');
      // Load fresh status from DB, then update the JWT with the new subscription status
      // so the navbar Subscribe button disappears immediately without a full sign-out.
      loadStatus().then(async (freshStatus) => {
        if (freshStatus?.subscriptionStatus) {
          await updateSession({ subscriptionStatus: freshStatus.subscriptionStatus });
        }
      });
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async (): Promise<DashboardStatus | null> => {
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/dashboard/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setError('');
        return data;
      } else {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || 'Failed to load dashboard');
        return null;
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError('Network error - please check your connection');
      return null;
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
      {/* Payment success toast */}
      {paymentSuccess && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">
            Subscription activated — full access unlocked.
          </p>
          <button
            onClick={() => setPaymentSuccess(false)}
            className="ml-auto text-green-600 hover:text-green-800 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Trial expiring soon banner (≤3 days left, not yet paywalled) */}
      {!status.isPaywalled && status.daysLeftInTrial !== null && status.daysLeftInTrial <= 3 && status.subscriptionStatus !== 'active' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-center">
          <p className="text-sm text-amber-800">
            Your free trial ends in{' '}
            <strong>{status.daysLeftInTrial} day{status.daysLeftInTrial !== 1 ? 's' : ''}</strong>.{' '}
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-amber-900 disabled:opacity-60"
            >
              {upgrading && <span className="inline-block w-3 h-3 border-2 border-amber-800 border-t-transparent rounded-full animate-spin" />}
              Upgrade to keep access →
            </button>
          </p>
        </div>
      )}

      {/* Trial expired banner */}
      {status.isPaywalled && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
          <p className="text-sm text-red-800">
            Your free trial has ended. Your data is safe —{' '}
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-red-900 disabled:opacity-60"
            >
              {upgrading && <span className="inline-block w-3 h-3 border-2 border-red-800 border-t-transparent rounded-full animate-spin" />}
              subscribe for £12.99/mo to unlock your dashboard →
            </button>
          </p>
        </div>
      )}

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

        <div className="flex items-center gap-2">
          {status?.subscriptionStatus === 'active' && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {portalLoading
                ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <CreditCard className="w-4 h-4" />}
              Manage Subscription
            </button>
          )}
          <button
            onClick={() => { setSettingsLoading(true); router.push('/settings'); }}
            disabled={settingsLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {settingsLoading
              ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <Settings className="w-4 h-4" />}
            Manage Setup
          </button>
        </div>
      </div>

      {/* Live Status Indicator */}
      <StatusIndicator 
        isLive={status.isLive}
        lastUpdate={status.campaigns[0]?.lastSession}
      />

      {/* Unregistered Traffic Alert */}
      {status.hasUnregisteredTraffic && (
        <UnregisteredTrafficAlert
          traffic={status.unregisteredTraffic}
          registeredCount={status.campaigns.length}
        />
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

      {/* Leak Table + Visitor Journeys — single paywall wraps both */}
      <div className="relative space-y-6">
        {status.isPaywalled && (
          <PaywallOverlay onUpgrade={handleUpgrade} />
        )}

        <div className={status.isPaywalled ? 'select-none pointer-events-none' : ''}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Wasted Spend Analysis
            </h2>

            <div className="flex items-center justify-center sm:justify-end gap-3">
              <DateRangePicker onRangeChange={handleLeakDateChange} />

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

        <div className={status.isPaywalled ? 'select-none pointer-events-none' : ''}>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Visitor Journeys
          </h2>
          <SessionsTable
            campaigns={status.campaigns}
            dateRange={leakDateRange}
            refreshTrigger={refreshTrigger}
          />
        </div>
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