'use client';
// =============================================================================
// AdLeak Shield — Admin Shell
// src/components/admin/AdminShell.tsx
//
// Wraps admin pages with:
//   - Top navigation bar
//   - Impersonation banner (shown when als_imp_label cookie is present)
//   - "Stop impersonation" button
// =============================================================================

import React, { useEffect, useState } from 'react';
import { SWRConfig } from 'swr';
import { signOut } from 'next-auth/react';

const LABEL_COOKIE = 'als_imp_label';

function getImpLabel(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(LABEL_COOKIE + '='));
  if (!match) return null;
  return decodeURIComponent(match.split('=')[1] ?? '');
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface AdminShellProps {
  ownerEmail: string;
  children: React.ReactNode;
}

export function AdminShell({ ownerEmail, children }: AdminShellProps) {
  const [impLabel, setImpLabel] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  // Read impersonation label from cookie on mount and every 30s
  useEffect(() => {
    const check = () => setImpLabel(getImpLabel());
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function stopImpersonation() {
    setStopping(true);
    try {
      await fetch('/api/admin/impersonate/stop', { method: 'POST' });
      setImpLabel(null);
      // Reload so all SWR caches reset to the owner's own data
      window.location.reload();
    } finally {
      setStopping(false);
    }
  }

  return (
    <SWRConfig value={{ fetcher }}>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* ------------------------------------------------------------------ */}
        {/* TOP NAV                                                             */}
        {/* ------------------------------------------------------------------ */}
        <header className="border-b border-gray-800 bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-red-400 font-bold tracking-widest text-xs uppercase">
                ⚙ Owner Admin
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400 text-sm">AdLeak Shield</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-500 text-xs">{ownerEmail}</span>
              <a
                href="/dashboard"
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                My Dashboard →
              </a>
              <button
                onClick={() => signOut({ callbackUrl: '/auth/login' })}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* IMPERSONATION BANNER                                                */}
        {/* ------------------------------------------------------------------ */}
        {impLabel && (
          <div className="bg-amber-500 text-gray-900 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4">
            <span>
              👁 Viewing as <strong>{impLabel}</strong> — read-only mode, all writes blocked
            </span>
            <button
              onClick={stopImpersonation}
              disabled={stopping}
              className="bg-gray-900 text-amber-400 px-3 py-0.5 rounded text-xs font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {stopping ? 'Stopping…' : 'Stop viewing'}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* PAGE CONTENT                                                        */}
        {/* ------------------------------------------------------------------ */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </SWRConfig>
  );
}
