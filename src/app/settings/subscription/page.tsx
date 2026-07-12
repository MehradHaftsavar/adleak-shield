'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, Check } from 'lucide-react';
import { PLAN_LIMITS } from '@/lib/planLimits';
import type { PlanType } from '@/types/auth';

interface UsageData {
  domainCount:   number;
  memberCount:   number;
  campaignCount: number;
}

function PlanCard({
  plan,
  isCurrent,
  isSubscribed,
  onSelect,
  loading,
}: {
  plan:         PlanType;
  isCurrent:    boolean;
  isSubscribed: boolean;
  onSelect:     (plan: PlanType) => void;
  loading:      boolean;
}) {
  const limits = PLAN_LIMITS[plan];
  const features = [
    `${limits.domains} domain${limits.domains > 1 ? 's' : ''}`,
    `${limits.campaignsPerDomain} campaign${limits.campaignsPerDomain > 1 ? 's' : ''} per domain`,
    `${limits.seats} seat${limits.seats > 1 ? 's' : ''} (incl. owner)`,
    'CSV data export',
    'Full session tracking',
  ];

  return (
    <div
      className={`relative border-2 rounded-xl p-6 flex flex-col gap-4 ${
        isCurrent
          ? 'border-indigo-600 bg-indigo-50'
          : 'border-gray-200 bg-white hover:border-gray-300 transition-colors'
      }`}
    >
      {isCurrent && (
        <span className="absolute -top-3 left-4 bg-indigo-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
          Current plan
        </span>
      )}
      <div>
        <h3 className="text-lg font-bold text-gray-900">{limits.label}</h3>
        <p className="text-3xl font-bold text-gray-900 mt-1">
          £{limits.priceGbp.toFixed(2)}
          <span className="text-sm font-normal text-gray-500">/mo</span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">incl. applicable taxes</p>
      </div>

      <ul className="space-y-2 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {!isCurrent && (
        <button
          onClick={() => onSelect(plan)}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {loading ? 'Processing…' : isSubscribed ? 'Switch to this plan' : 'Subscribe'}
        </button>
      )}
    </div>
  );
}

export default function SubscriptionPage() {
  const { data: session, status, update } = useSession();
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [usage,   setUsage]   = useState<UsageData | null>(null);
  const [loading, setLoading] = useState<PlanType | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [confirmChange, setConfirmChange] = useState<{ plan: PlanType; isUpgrade: boolean; trialing?: boolean; resubscribing?: boolean } | null>(null);

  // When Stripe redirects back after a confirmed upgrade, sync plan immediately
  useEffect(() => {
    if (searchParams.get('upgrade') === 'success') {
      fetch('/api/stripe/sync-plan', { method: 'POST' })
        .then(r => r.ok ? r.json() : null)
        .then(async (data) => {
          if (data?.plan) await update({ planType: data.plan, subscriptionStatus: data.subscriptionStatus });
          else await update();
          router.replace('/settings/subscription');
          setMessage('Plan upgraded successfully. Your new plan is now active.');
        })
        .catch(async () => {
          await update();
          router.replace('/settings/subscription');
          setMessage('Plan upgraded successfully. Your new plan is now active.');
        });
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    // Fetch current usage to show alongside plan limits
    async function load() {
      try {
        const [domains, campaigns, members] = await Promise.all([
          fetch('/api/domain').then(r => r.ok ? r.json() : null),
          fetch('/api/campaigns').then(r => r.ok ? r.json() : null),
          fetch('/api/team/members').then(r => r.ok ? r.json() : null),
        ]);
        setUsage({
          domainCount:   domains?.count    ?? (domains?.domain ? 1 : 0),
          campaignCount: campaigns?.count  ?? 0,
          memberCount:   (members?.members?.length ?? 0) + 1, // +1 for owner
        });
      } catch { /* non-fatal */ }
    }
    if (status === 'authenticated' && session?.user?.tenantId) load();
  }, [status, session]);

  const PLAN_ORDER: Record<PlanType, number> = { starter: 0, freelancer: 1, agency: 2 };

  function handlePlanSelect(plan: PlanType) {
    setMessage('');
    setIsError(false);

    // Active subscriber downgrading → show confirmation modal first
    if (isSubscribed && PLAN_ORDER[plan] < PLAN_ORDER[currentPlan]) {
      setConfirmChange({ plan, isUpgrade: false });
      return;
    }

    // Trialing user changing plan → show confirmation modal
    if (subscriptionStatus === 'trialing') {
      setConfirmChange({ plan, isUpgrade: PLAN_ORDER[plan] > PLAN_ORDER[currentPlan], trialing: true });
      return;
    }

    // Canceled / no subscription → confirm before routing to Stripe checkout
    if (!isSubscribed) {
      setConfirmChange({ plan, isUpgrade: true, resubscribing: true });
      return;
    }

    void executeSwitch(plan);
  }

  async function executeSwitch(plan: PlanType) {
    setLoading(plan);
    setMessage('');
    setIsError(false);

    try {
      if (subscriptionStatus === 'trialing') {
        const res  = await fetch('/api/user/plan', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ plan }),
        });
        const data = await res.json();

        if (!res.ok) {
          setIsError(true);
          setMessage(data.error || 'Something went wrong. Please try again.');
          return;
        }

        // Returning subscriber with admin-extended trial — needs a new Stripe subscription
        if (data.redirect === 'checkout') {
          const checkoutRes  = await fetch('/api/stripe/checkout', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ plan }),
          });
          const checkoutData = await checkoutRes.json();
          if (checkoutData.url) {
            window.location.href = checkoutData.url;
          } else {
            setIsError(true);
            setMessage(checkoutData.error || 'Something went wrong. Please try again.');
          }
          return;
        }

        // Genuine trial user — plan preference saved, billed at trial end
        await update({ planType: plan });
        setMessage(`Plan updated to ${PLAN_LIMITS[plan].label}. You'll be billed this amount when your trial ends.`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (!isSubscribed) {
        // Canceled / no subscription — go straight to checkout for the chosen plan
        const res  = await fetch('/api/stripe/checkout', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ plan }),
        });
        const data = await res.json();
        if (data.url) window.location.href = data.url;
        else { setIsError(true); setMessage(data.error || 'Something went wrong. Please try again.'); }
        return;
      }

      // Active paid subscriber — upgrade or downgrade via direct Stripe API
      const upgradeRes  = await fetch('/api/stripe/upgrade', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      });
      const upgradeData = await upgradeRes.json();

      // Upgrade via Stripe portal confirmation — redirect user there
      if (upgradeRes.ok && upgradeData.url) {
        window.location.href = upgradeData.url;
        return;
      }

      // Downgrade: immediate with prorated credit
      if (upgradeRes.ok && upgradeData.immediateDowngrade) {
        await update({ planType: plan });
        setMessage(`Plan switched to ${PLAN_LIMITS[plan].label}. A prorated credit for your unused time has been applied to your next invoice.`);
        return;
      }

      // Fallback: no live Stripe subscription found — go to checkout
      if (upgradeData.redirect === 'checkout') {
        const checkoutRes  = await fetch('/api/stripe/checkout', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ plan }),
        });
        const checkoutData = await checkoutRes.json();
        if (checkoutData.url) window.location.href = checkoutData.url;
        return;
      }

      setIsError(true);
      setMessage(upgradeData.error || 'Something went wrong. Please try again.');
    } catch {
      setIsError(true);
      setMessage('Network error. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  async function handleManagePortal() {
    try {
      const res  = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');

        // When the user closes the portal tab and returns here, sync the
        // subscription status from the DB so the page reflects any cancellation
        // or payment method change without requiring a logout.
        const syncOnReturn = async () => {
          if (document.visibilityState !== 'visible') return;
          document.removeEventListener('visibilitychange', syncOnReturn);

          const trySync = async (): Promise<string | null> => {
            try {
              const syncRes  = await fetch('/api/stripe/sync-plan', { method: 'POST' });
              const syncData = syncRes.ok ? await syncRes.json() : null;
              if (syncData?.subscriptionStatus) {
                await update({ planType: syncData.plan, subscriptionStatus: syncData.subscriptionStatus });
                return syncData.subscriptionStatus as string;
              }
            } catch { /* non-fatal */ }
            return null;
          };

          // Wait 2s for the Stripe webhook to be processed before reading the DB.
          // If the status is still active after the first attempt, retry once more after 3s.
          await new Promise(r => setTimeout(r, 2000));
          const status = await trySync();
          if (status === 'active') {
            await new Promise(r => setTimeout(r, 3000));
            await trySync();
          }
        };
        document.addEventListener('visibilitychange', syncOnReturn);
      }
    } catch { /* non-fatal */ }
  }

  if (status === 'loading' || (status === 'authenticated' && !session?.user?.tenantId)) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-8 h-8 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const currentPlan        = (session?.user?.planType ?? 'starter') as PlanType;
  const subscriptionStatus = session?.user?.subscriptionStatus as string | undefined;
  const isSubscribed       = subscriptionStatus === 'active';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
          <CreditCard className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
          <p className="text-gray-600 text-sm">Manage your plan and billing</p>
        </div>
      </div>

      {/* Current status banner */}
      {isSubscribed && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800 font-medium">
            Active subscription — {PLAN_LIMITS[currentPlan].label}
          </p>
        </div>
      )}

      {/* Current usage */}
      {usage && (
        <div className="mb-8 grid grid-cols-3 gap-4">
          {[
            { label: 'Domains',   used: usage.domainCount,   max: PLAN_LIMITS[currentPlan].domains },
            { label: 'Campaigns', used: usage.campaignCount, max: PLAN_LIMITS[currentPlan].campaignsPerDomain * PLAN_LIMITS[currentPlan].domains },
            { label: 'Seats',     used: usage.memberCount,   max: PLAN_LIMITS[currentPlan].seats },
          ].map(({ label, used, max }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{used}<span className="text-sm font-normal text-gray-400">/{max}</span></p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${used >= max ? 'bg-red-500' : 'bg-indigo-500'}`}
                  style={{ width: `${Math.min(100, (used / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${isError ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
          <p className={`text-sm ${isError ? 'text-red-800' : 'text-blue-800'}`}>{message}</p>
        </div>
      )}

      {/* Billing management */}
      {isSubscribed && (
        <div className="mb-8 p-5 bg-white border border-gray-200 rounded-xl">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Manage billing or cancel</h2>
          <p className="text-sm text-gray-500 mb-4">
            Update your payment method, download invoices, or cancel your subscription via the Stripe billing portal. Cancellations take effect immediately and any unused time is refunded to your original payment method.
          </p>
          <button
            onClick={handleManagePortal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Open billing portal ↗
          </button>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['starter', 'freelancer', 'agency'] as PlanType[]).map(plan => (
          <PlanCard
            key={plan}
            plan={plan}
            isCurrent={currentPlan === plan && isSubscribed}
            isSubscribed={isSubscribed}
            onSelect={handlePlanSelect}
            loading={loading === plan}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        All plan changes take effect immediately. A prorated credit for any unused time is applied to your next invoice.
      </p>

      {/* Plan change confirmation modal */}
      {confirmChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              {confirmChange.resubscribing ? 'Confirm subscription' : confirmChange.trialing ? 'Confirm plan change' : confirmChange.isUpgrade ? 'Confirm upgrade' : 'Confirm downgrade'}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {confirmChange.resubscribing ? (
                <>
                  You&apos;re subscribing to <strong>{PLAN_LIMITS[confirmChange.plan].label}</strong> at{' '}
                  <strong>£{PLAN_LIMITS[confirmChange.plan].priceGbp.toFixed(2)}/month</strong>.
                </>
              ) : confirmChange.trialing ? (
                <>
                  You&apos;re switching to <strong>{PLAN_LIMITS[confirmChange.plan].label}</strong> at{' '}
                  <strong>£{PLAN_LIMITS[confirmChange.plan].priceGbp.toFixed(2)}/month</strong>.
                </>
              ) : (
                <>
                  You&apos;re switching from <strong>{PLAN_LIMITS[currentPlan].label}</strong> to{' '}
                  <strong>{PLAN_LIMITS[confirmChange.plan].label}</strong>. This takes effect immediately.
                </>
              )}
            </p>
            <p className="text-sm text-gray-600 mb-6">
              {confirmChange.resubscribing
                ? 'You\'ll be taken to Stripe to complete payment. Make sure you\'ve selected the right plan before continuing.'
                : confirmChange.trialing
                  ? 'You won\'t be charged until your trial ends. If your trial has already expired, you\'ll be taken to Stripe to complete payment.'
                  : confirmChange.isUpgrade
                    ? 'You\'ll be charged the prorated difference for the remaining days in your current billing period.'
                    : 'Any unused time on your current plan will be credited and automatically deducted from your next invoice — you won\'t be charged twice.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmChange(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { plan } = confirmChange;
                  setConfirmChange(null);
                  void executeSwitch(plan);
                }}
                disabled={loading === confirmChange.plan}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60 ${
                  confirmChange.resubscribing || confirmChange.trialing || confirmChange.isUpgrade ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {loading === confirmChange.plan && (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {confirmChange.resubscribing ? 'Continue to Stripe' : confirmChange.trialing ? 'Confirm' : confirmChange.isUpgrade ? 'Confirm upgrade' : 'Confirm downgrade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
