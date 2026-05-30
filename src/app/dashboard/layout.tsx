'use client';

// =============================================================================
// AdLeak Shield — Dashboard Layout
// src/app/dashboard/layout.tsx
//
// Guards the entire /dashboard subtree on the client side.
//
// WHY THIS EXISTS alongside middleware:
//   Middleware handles initial page loads and server-side navigation. But if a
//   user's 1-hour session expires while they are already on the dashboard, the
//   JWT cookie becomes invalid and every API call returns 401. Without this
//   layout the page just shows empty data and errors. This layout detects that
//   state and redirects to /auth/login immediately.
//
// TWO LAYERS OF PROTECTION:
//   1. useSession — redirects when NextAuth reports the session is gone
//      (fires on mount and whenever Next.js revalidates the session, e.g. on
//      window focus if refetchOnWindowFocus is enabled in SessionProvider).
//   2. fetch monkey-patch — intercepts any 401 response from our own API and
//      redirects to /auth/login, catching the race window between the session
//      expiring and useSession noticing.
// =============================================================================

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const patched = useRef(false);

  // Layer 1: session status redirect
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login');
    }
  }, [status, router]);

  // Layer 2: fetch monkey-patch — intercept 401s from our own API
  useEffect(() => {
    if (patched.current) return;
    patched.current = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // Only intercept 401s from our own API routes
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (response.status === 401 && url.startsWith('/api/')) {
        router.replace('/auth/login');
      }

      return response;
    };

    // Restore original fetch when leaving the dashboard
    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);

  // Show nothing while checking auth — avoids flash of empty dashboard
  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
