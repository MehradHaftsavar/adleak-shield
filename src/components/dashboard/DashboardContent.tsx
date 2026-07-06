'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PLAN_LIMITS } from '@/lib/planLimits';
import type { PlanType } from '@/types/auth';
import { Activity, Plus, RefreshCw, CheckCircle, ChevronDown } from 'lucide-react';
import { StatusIndicator } from '@/components/dashboard/StatusIndicator';
import { CampaignStatusCard } from '@/components/dashboard/CampaignStatusCard';
import { UnregisteredTrafficAlert } from '@/components/dashboard/UnregisteredTrafficAlert';
import { LeakTable } from './LeakTable';
import { SessionsTable } from './SessionsTable';
import { DateRangePicker } from './DateRangePicker';
import PaywallOverlay from './PaywallOverlay';
import { DashboardSkeleton } from '@/components/ui/skeletons';

interface DashboardStatus {
  isLive: boolean;
  campaigns: Array<{
    id: string;
    domainId: string;
    googleCampaignId: string;
    slotNumber: number;
    name: string | null;
    domain: string;
    status: string;
    sessionCount: number;
    lastSession: Date | null;
  }>;
  unregisteredTraffic: Array<{
    googleCampaignId: string;
    domainId:         string | null;
    domainName:       string | null;
    hitCount:         number;
    lastDetected:     Date;
    isMismatch:       boolean;
  }>;
  hasUnregisteredTraffic: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  isPaywalled: boolean;
  daysLeftInTrial: number | null;
}

export function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();

  // Derive the role and ownership for the currently active workspace
  const ownTenantId    = session?.user?.tenantId;
  const activeTenantId = session?.user?.activeTenantId;
  const isOwnerView    = !activeTenantId || activeTenantId === ownTenantId;

  const isViewer = (() => {
    if (isOwnerView) return false;
    const all = session?.user?.allAccessibleDomains ?? [];
    const activeDomainId = session?.user?.activeDomainId;
    if (activeDomainId) {
      return all.find(d => d.domainId === activeDomainId)?.role === 'visitor';
    }
    const ws = all.filter(d => d.tenantId === activeTenantId);
    return ws.length > 0 && ws.every(d => d.role === 'visitor');
  })();

  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // Set immediately from the URL param so the banner shows before router.replace
  // strips ?payment=success. Persisted to sessionStorage under a tenant-scoped key
  // so a new account with a different tenantId never inherits a previous payment flag.
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(
    () => searchParams.get('payment') === 'success'
  );

  // Once session is available, persist/restore the flag under the tenant-scoped key.
  // Store a timestamp so the banner only shows within a 10-minute window after payment —
  // prevents re-login on the same tab from re-showing the banner.
  const tenantId = session?.user?.tenantId as string | undefined;
  useEffect(() => {
    if (!tenantId) return;
    const key = `als_payment_success_${tenantId}`;
    if (searchParams.get('payment') === 'success') {
      sessionStorage.setItem(key, String(Date.now()));
    } else if (!paymentSuccess) {
      const ts = Number(sessionStorage.getItem(key) ?? 0);
      if (ts && Date.now() - ts < 10 * 60 * 1000) setPaymentSuccess(true);
    }
  }, [tenantId]); // eslint-disable-line
  const [upgrading, setUpgrading] = useState(false);
  const [campaignsOpen, setCampaignsOpen] = useState(true);

  const planType  = (session?.user?.planType ?? 'starter') as PlanType;
  const planPrice = PLAN_LIMITS[planType].priceGbp.toFixed(2);

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
      const plan = session?.user?.planType ?? 'starter';
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setUpgrading(false);
    }
  }, [session?.user?.planType]);


  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      // Strip the query param cleanly without a page reload
      router.replace('/dashboard');
      // Load fresh status from DB, then push the new subscription status into the
      // JWT so the navbar Subscribe/Manage buttons update without a sign-out.
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

  // Re-fetch when the user switches domains via the dropdown (no page reload needed)
  const activeDomainId = session?.user?.activeDomainId;
  const prevDomainRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevDomainRef.current === undefined) {
      prevDomainRef.current = activeDomainId ?? null;
      return;
    }
    if (prevDomainRef.current !== (activeDomainId ?? null)) {
      prevDomainRef.current = activeDomainId ?? null;
      loadStatus();
      setRefreshTrigger(t => t + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDomainId]);

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
    return <DashboardSkeleton />;
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
            onClick={() => { setPaymentSuccess(false); if (tenantId) sessionStorage.removeItem(`als_payment_success_${tenantId}`); }}
            className="ml-auto text-green-600 hover:text-green-800 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Trial expiring soon banner — owner only, not yet paywalled */}
      {isOwnerView && !status.isPaywalled && status.daysLeftInTrial !== null && status.daysLeftInTrial <= 3 && status.subscriptionStatus !== 'active' && (
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

      {/* Paywalled top banner — owner only */}
      {isOwnerView && status.isPaywalled && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
          <p className="text-sm text-red-800">
            {status.subscriptionStatus === 'canceled'
              ? 'Your subscription has ended. Your data is preserved for 90 days — '
              : 'Your free trial has ended. Your data is safe — '}
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-red-900 disabled:opacity-60"
            >
              {upgrading && <span className="inline-block w-3 h-3 border-2 border-red-800 border-t-transparent rounded-full animate-spin" />}
              {status.subscriptionStatus === 'canceled' ? 'resubscribe to unlock →' : `subscribe for £${planPrice}/mo to unlock your dashboard →`}
            </button>
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 text-sm mt-0.5">Monitor your tracking status</p>
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
          campaigns={status.campaigns}
          maxPerDomain={PLAN_LIMITS[(session?.user?.planType ?? 'starter') as PlanType].campaignsPerDomain}
          isViewer={isViewer}
        />
      )}

      {/* Campaign Status Cards */}
      <div>
        <button
          onClick={() => setCampaignsOpen(o => !o)}
          className="flex items-center justify-between w-full text-left mb-4 group"
        >
          <h2 className="text-xl font-semibold text-gray-900">
            Campaign Status
            {status.campaigns.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">({status.campaigns.length})</span>
            )}
          </h2>
          <ChevronDown className={`w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-transform duration-200 ${campaignsOpen ? '' : '-rotate-90'}`} />
        </button>

        {campaignsOpen && (
          status.campaigns.length === 0 ? (
            <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-600 mb-4">No campaigns registered yet</p>
              {!isViewer && (
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add Your First Campaign
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
          )
        )}
      </div>

      {/* Leak Table + Visitor Journeys — single paywall wraps both */}
      <div className="relative space-y-6">
        {status.isPaywalled && (
          <PaywallOverlay
            onUpgrade={handleUpgrade}
            priceGbp={planPrice}
            reason={status.subscriptionStatus === 'canceled' ? 'canceled' : 'trial_ended'}
            isOwnerView={isOwnerView}
          />
        )}

        <div className={status.isPaywalled ? 'select-none pointer-events-none' : ''}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Wasted Spend Analysis
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <DateRangePicker onRangeChange={handleLeakDateChange} />

              <button
                onClick={handleManualRefresh}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex-shrink-0"
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