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

import React from 'react';
import { SWRConfig } from 'swr';
import { signOut } from 'next-auth/react';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

interface AdminShellProps {
  ownerEmail: string;
  children: React.ReactNode;
}

export function AdminShell({ ownerEmail, children }: AdminShellProps) {

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
        {/* PAGE CONTENT                                                        */}
        {/* ------------------------------------------------------------------ */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </SWRConfig>
  );
}
