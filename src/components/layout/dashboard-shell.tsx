"use client";
// =============================================================================
// AdLeak Shield — Dashboard Shell
// src/components/layout/dashboard-shell.tsx
//
// This is a CLIENT COMPONENT — it runs in the browser.
// It wraps the entire dashboard with:
//   1. SWR Provider — enables data fetching with cache across all child components
//   2. Trial/expiry banner
//   3. Navigation bar
//   4. Thaw progress bar (appears only if DB takes > 2s)
//
// Phase 1.2: Skeleton loaders
// Phase 3.2: Accepts children to render actual dashboard content
// =============================================================================

import React, { useState, useEffect } from "react";
import { SWRConfig } from "swr";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LegalFooter } from "@/components/layout/LegalFooter";

const IMP_LABEL_COOKIE = 'als_imp_label';

function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  async function handlePortal() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      onClick={handlePortal}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
    >
      {loading ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : null}
      Manage Subscription
    </button>
  );
}

function getImpLabel(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(IMP_LABEL_COOKIE + '='));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
}

interface DashboardShellProps {
  email: string;
  tenantId: string;
  children: React.ReactNode;
}

export function DashboardShell({
  email,
  tenantId,
  children,
}: DashboardShellProps) {
  const [thawVisible,     setThawVisible]     = useState(false);
  const [thawProgress,    setThawProgress]    = useState(0);
  const [impLabel,        setImpLabel]        = useState<string | null>(null);
  const [stoppingImp,     setStoppingImp]     = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [menuOpen,        setMenuOpen]        = useState(false);

  const router = useRouter();
  const { data: session, status, update } = useSession();
  const subscriptionStatus = session?.user?.subscriptionStatus as string | undefined;

  // Redirect to login if the session expires while the user is on the page
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);
  const isActive = subscriptionStatus === 'active';
  const isCancelled = subscriptionStatus === 'canceled';

  // After returning from Stripe checkout, force a session refresh so the
  // subscribe button reflects the new subscription status immediately.
  // NOTE: do NOT strip ?payment=success here — DashboardContent reads it via
  // useSearchParams to show the success banner, then clears it via router.replace.
  // Calling replaceState here races against that read and can swallow the banner.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      update();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe() {
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setCheckoutLoading(false);
    }
  }

  // Check for impersonation cookie on mount
  useEffect(() => {
    setImpLabel(getImpLabel());
  }, []);

  async function stopImpersonation() {
    setStoppingImp(true);
    try {
      await fetch('/api/admin/impersonate/stop', { method: 'POST' });
      // Redirect back to admin panel — not a reload
      window.location.href = '/admin';
    } finally {
      setStoppingImp(false);
    }
  }

  // ===========================================================================
  // THAW DETECTION
  // On dashboard load, ping the wake endpoint to check DB status.
  // If it takes > 2 seconds, show the progress bar.
  // ===========================================================================
  useEffect(() => {
    const start = Date.now();
    const thawTimer = setTimeout(() => {
      // DB taking more than 2s — show the progress bar
      setThawVisible(true);
      setThawProgress(30);
      setTimeout(() => setThawProgress(90), 500);
    }, 2000);

    fetch("/api/wake")
      .then(() => {
        clearTimeout(thawTimer);
        const elapsed = Date.now() - start;
        if (elapsed > 2000) {
          // DB was slow — snap progress bar to 100% then hide
          setThawProgress(100);
          setTimeout(() => {
            setThawVisible(false);
            setThawProgress(0);
          }, 400);
        }
      })
      .catch(() => clearTimeout(thawTimer));

    return () => clearTimeout(thawTimer);
  }, []);

  // ===========================================================================
  // SWR GLOBAL CONFIGURATION
  // fetcher: the default function SWR uses to fetch data
  // revalidateOnFocus: refresh data when user switches back to the tab
  // dedupingInterval: don't make the same request more than once per 30s
  // ===========================================================================
  const swrConfig = {
    fetcher: (url: string) => fetch(url).then((r) => r.json()),
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  };

  return (
    <SWRConfig value={swrConfig}>
      {/* Thaw progress bar — only visible when DB is waking up */}
      {thawVisible && (
        <div
          className="fixed left-0 top-0 z-50 h-1 bg-indigo-500 transition-all"
          style={{
            width: `${thawProgress}%`,
            transitionDuration:
              thawProgress === 90 ? "25000ms" : "500ms",
            transitionTimingFunction:
              thawProgress === 90
                ? "linear"
                : "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}

      {/* Impersonation banner — only shown when admin is viewing as another user */}
      {impLabel && (
        <div className="bg-amber-400 text-gray-900 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4">
          <span>
            👁 Viewing as <strong>{impLabel}</strong> — read-only, all writes blocked
          </span>
          <button
            onClick={stopImpersonation}
            disabled={stoppingImp}
            className="bg-gray-900 text-amber-400 px-3 py-0.5 rounded text-xs font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {stoppingImp ? 'Stopping…' : '← Back to admin'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 relative z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* ── Left: logo + desktop nav links ── */}
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900 tracking-tight whitespace-nowrap">
                AdLeak Shield
              </span>
              <div className="hidden md:flex items-center gap-5">
                <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Dashboard
                </Link>
                <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Manage Setup
                </Link>
              </div>
            </div>

            {/* ── Right: desktop extras + hamburger ── */}
            <div className="flex items-center gap-3">

              {/* Desktop-only: subscribe/manage + email + sign out */}
              <div className="hidden md:flex items-center gap-3">
                {!isActive && (
                  <button
                    onClick={handleSubscribe}
                    disabled={checkoutLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    {checkoutLoading
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : null}
                    {isCancelled ? 'Resubscribe' : 'Subscribe — £12.99/mo'}
                  </button>
                )}
                {isActive && <ManageSubscriptionButton />}
                <span className="text-xs text-gray-400 max-w-[160px] truncate">{email}</span>
                <button
                  onClick={() => signOut({ callbackUrl: "/auth/login" })}
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors whitespace-nowrap"
                >
                  Sign out
                </button>
              </div>

              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                aria-label="Open menu"
              >
                {menuOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white shadow-lg">
            <div className="px-4 py-3 space-y-1">
              <p className="text-xs text-gray-400 pb-2 border-b border-gray-100 truncate">{email}</p>

              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="block px-2 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="block px-2 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Manage Setup
              </Link>

              {/* Subscribe / Manage — mobile only, lives here not in the nav bar */}
              <div className="pt-2 border-t border-gray-100">
                {!isActive && (
                  <button
                    onClick={() => { setMenuOpen(false); handleSubscribe(); }}
                    disabled={checkoutLoading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {checkoutLoading
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : null}
                    {isCancelled ? 'Resubscribe' : 'Subscribe — £12.99/mo'}
                  </button>
                )}
                {isActive && (
                  <div onClick={() => setMenuOpen(false)}>
                    <ManageSubscriptionButton />
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => signOut({ callbackUrl: "/auth/login" })}
                  className="w-full text-left px-2 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <LegalFooter />
    </SWRConfig>
  );
}
