'use client';

import { useState } from 'react';
import { Lock, PauseCircle } from 'lucide-react';

interface PaywallOverlayProps {
  onUpgrade: () => Promise<void>;
}

export default function PaywallOverlay({ onUpgrade }: PaywallOverlayProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onUpgrade();
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm bg-white/60">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 mx-auto mb-5">
          <Lock className="w-7 h-7 text-gray-600" />
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Your free trial has ended
        </h2>

        <p className="text-sm text-gray-500 mb-4">
          Subscribe to continue seeing your keyword data and wasted spend analysis.
        </p>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-6 text-left">
          <PauseCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Data collection is paused.</span> No click or keyword data is being recorded for your campaigns while your subscription is inactive.
          </p>
        </div>

        <div className="mb-1">
          <span className="text-3xl font-bold text-gray-900">£12.99</span>
          <span className="text-gray-500 text-sm ml-1">/ month</span>
        </div>
        <p className="text-xs text-gray-400 mb-6">Cancel anytime</p>

        <button
          onClick={handleClick}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {loading && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {loading ? 'Redirecting to Stripe…' : 'Start Subscription'}
        </button>

        <p className="text-xs text-gray-400 mt-3">Secure payment via Stripe</p>
      </div>
    </div>
  );
}
