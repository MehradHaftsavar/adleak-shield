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
import { signOut } from "next-auth/react";
import Link from "next/link";

const IMP_LABEL_COOKIE = 'als_imp_label';

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
  const [thawVisible,   setThawVisible]   = useState(false);
  const [thawProgress,  setThawProgress]  = useState(0);
  const [impLabel,      setImpLabel]      = useState<string | null>(null);
  const [stoppingImp,   setStoppingImp]   = useState(false);

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
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900 tracking-tight">
                AdLeak Shield
              </span>
              <Link
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Dashboard
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400 hidden sm:block">
                {email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/auth/login" })}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor your tracking status
          </p>
        </div>

        {/* Phase 3.2: Render actual dashboard content */}
        {children}
      </main>
    </SWRConfig>
  );
}
