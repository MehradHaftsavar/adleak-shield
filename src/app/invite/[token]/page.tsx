'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function InviteAcceptPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = typeof params?.token === 'string' ? params.token : '';

  const { data: session, status, update } = useSession();

  const [accepting,  setAccepting]  = useState(false);
  const [accepted,   setAccepted]   = useState(false);
  const [error,      setError]      = useState('');

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError('');

    try {
      const res  = await fetch('/api/team/invite/accept', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to accept invitation');
        return;
      }

      // Refresh the JWT so the new tenant's domains appear in allAccessibleDomains
      await update({ refreshAccessibleDomains: true });
      setAccepted(true);

      // Redirect to dashboard after short delay
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setAccepting(false);
    }
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation accepted!</h1>
          <p className="text-gray-600 mb-4">You now have access to the workspace. Redirecting you to the dashboard…</p>
          <Link href="/dashboard" className="text-indigo-600 text-sm font-medium hover:underline">
            Go to dashboard now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <p className="text-xl font-bold text-gray-900 tracking-tight">AdLeak Shield</p>
          <p className="text-sm text-gray-500 mt-1">Team invitation</p>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">You've been invited</h1>
        <p className="text-gray-600 mb-8">
          You've been invited to join an AdLeak Shield workspace. Accept the invitation below to gain access.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {status === 'loading' ? (
          <div className="flex justify-center">
            <span className="w-6 h-6 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : status === 'unauthenticated' ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-4">
              Please sign in or create an account to accept this invitation. After signing in, return to this link to accept.
            </p>
            <Link
              href={`/auth/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
              className="block w-full text-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
            >
              Sign in to accept
            </Link>
            <Link
              href={`/auth/signup?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
              className="block w-full text-center px-4 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-colors"
            >
              Create an account
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Signed in as <strong>{session?.user?.email}</strong>. Make sure this matches the email the invitation was sent to.
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors"
            >
              {accepting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {accepting ? 'Accepting…' : 'Accept Invitation'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
