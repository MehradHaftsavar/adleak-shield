'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token  = typeof params?.token === 'string' ? params.token : '';

  const { status, update } = useSession();

  const [state, setState]               = useState<'accepting' | 'accepted' | 'error'>('accepting');
  const [error, setError]               = useState('');
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const acceptedRef   = useRef(false);
  const redirectedRef = useRef(false);

  // 1) Accept as soon as the page loads — the token alone is the proof, so this
  //    works whether or not the visitor is logged in or even has an account yet.
  useEffect(() => {
    if (acceptedRef.current) return;
    if (!token) { setState('error'); setError('Invalid invitation link.'); return; }
    acceptedRef.current = true;

    (async () => {
      try {
        const res  = await fetch('/api/team/invite/accept', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));

        // Already-accepted is a success from the user's point of view — the invite
        // is accepted either way.
        if (res.ok || res.status === 409) {
          if (data.invitedEmail) setInvitedEmail(data.invitedEmail);
          setState('accepted');
        } else {
          setState('error');
          setError(data.error || 'This invitation link is invalid or has expired.');
        }
      } catch {
        setState('error');
        setError('Network error. Please try again.');
      }
    })();
  }, [token]);

  // 2) If the visitor is already logged in, refresh their session so the new
  //    workspace appears, then send them to the dashboard.
  useEffect(() => {
    if (state !== 'accepted' || status !== 'authenticated' || redirectedRef.current) return;
    redirectedRef.current = true;
    (async () => {
      try { await update({ refreshAccessibleDomains: true }); } catch { /* non-fatal */ }
      router.push('/dashboard');
    })();
  }, [state, status, update, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        {/* Logo */}
        <div className="mb-8">
          <p className="text-xl font-bold text-gray-900 tracking-tight">AdLeak Shield</p>
          <p className="text-sm text-gray-500 mt-1">Team invitation</p>
        </div>

        {state === 'accepting' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
              <span className="w-8 h-8 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Accepting your invitation…</h1>
            <p className="text-sm text-gray-500">Just a moment.</p>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation problem</h1>
            <p className="text-sm text-gray-600 mb-6">{error}</p>
            <Link href="/auth/login" className="text-indigo-600 text-sm font-medium hover:underline">
              Go to sign in
            </Link>
          </>
        )}

        {state === 'accepted' && status !== 'authenticated' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation accepted!</h1>
            <p className="text-gray-600 mb-6">
              To access the workspace, create your account{invitedEmail ? <> using <strong>{invitedEmail}</strong></> : ' with the email this invitation was sent to'} — or sign in if you already have one.
            </p>
            <div className="space-y-3">
              <Link
                href="/auth/signup"
                className="block w-full text-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
              >
                Create an account
              </Link>
              <Link
                href="/auth/login"
                className="block w-full text-center px-4 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-colors"
              >
                Sign in
              </Link>
            </div>
          </>
        )}

        {state === 'accepted' && status === 'authenticated' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation accepted!</h1>
            <p className="text-gray-600 mb-4">You now have access to the workspace. Taking you to the dashboard…</p>
            <Link href="/dashboard" className="text-indigo-600 text-sm font-medium hover:underline">
              Go to dashboard now
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
