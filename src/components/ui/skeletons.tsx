// =============================================================================
// AdLeak Shield — Skeleton Loader Components
// src/components/ui/skeletons.tsx
//
// These shimmer placeholders display IMMEDIATELY when a dashboard page loads,
// before the database has finished waking up or returning data.
// They prevent a blank white screen during the up-to-30s cold start.
// =============================================================================

import React from "react";

// =============================================================================
// BASE SHIMMER — the animated grey block all skeletons are built from
// =============================================================================
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`}
    />
  );
}

// =============================================================================
// LEAK TABLE SKELETON
// Mirrors the layout of the real Leak Table (Phase 3).
// Shows 5 placeholder rows while data loads.
// =============================================================================
export function LeakTableSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Table header */}
      <div className="flex gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <Shimmer className="h-4 w-40" />
        <Shimmer className="h-4 w-16" />
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-4 w-20" />
      </div>
      {/* Table rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-700"
        >
          <Shimmer className="h-4 w-48" />
          <Shimmer className="h-4 w-10" />
          <Shimmer className="h-4 w-20" />
          <Shimmer className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// JOURNEY TIMELINE SKELETON
// Mirrors the per-session Journey Timeline list (Phase 4).
// =============================================================================
export function JourneyTimelineSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <div className="mt-1 flex-shrink-0">
            <Shimmer className="h-3 w-3 rounded-full" />
          </div>
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-3/4" />
            <Shimmer className="h-3 w-1/2" />
          </div>
          <Shimmer className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// STATS CARDS SKELETON
// Used for the top-of-dashboard metric cards (total waste, bounce rate, etc.)
// =============================================================================
export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
        >
          <Shimmer className="mb-2 h-3 w-24" />
          <Shimmer className="h-8 w-32" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// DASHBOARD SKELETON
// Mirrors DashboardContent exactly — same padding, same section heights,
// same number of rows — so there's no layout jump when real data arrives.
// =============================================================================
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">

      {/* ── 1. Header row  (icon + "Dashboard" h1 + subtitle + buttons) ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shimmer className="w-12 h-12 rounded-full flex-shrink-0" />
          <div className="space-y-2">
            <Shimmer className="h-9 w-44" />   {/* text-3xl font-bold */}
            <Shimmer className="h-4 w-52" />   {/* subtitle */}
          </div>
        </div>
        {/* Only "Manage Setup" shown unconditionally — Manage Subscription is active-only */}
        <div className="flex items-center gap-2">
          <Shimmer className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* ── 2. Live status bar  (p-4, single row) ── */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Shimmer className="w-3 h-3 rounded-full flex-shrink-0" />
          <Shimmer className="h-5 w-36" />           {/* "Live" / "Awaiting Data" */}
          <Shimmer className="h-4 w-44 ml-auto hidden sm:block" /> {/* Last data: … */}
        </div>
      </div>

      {/* ── 3. Campaign Status cards ── */}
      <div>
        <Shimmer className="h-7 w-40 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            // Mirrors CampaignStatusCard: p-4, flex header, ID, domain, badge
            <div key={i} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="space-y-1.5">
                  <Shimmer className="h-5 w-28" />   {/* "Campaign 1" font-semibold */}
                  <Shimmer className="h-4 w-36" />   {/* "ID: 123456789" text-sm */}
                  <Shimmer className="h-3 w-32" />   {/* "Domain: …" text-xs */}
                </div>
                <Shimmer className="w-5 h-5 rounded-full flex-shrink-0" /> {/* status icon */}
              </div>
              {/* Status badge: inline-flex px-3 py-1 rounded-full text-sm */}
              <Shimmer className="h-7 w-32 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Wasted Spend Analysis ── */}
      <div>
        {/* Heading row — mirrors real: h2 + DateRangePicker + Refresh button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <Shimmer className="h-7 w-52" />
          <div className="flex items-center gap-3">
            <Shimmer className="h-9 w-44 rounded-lg" />
            <Shimmer className="h-9 w-24 rounded-lg" />
          </div>
        </div>

        {/* LeakTable — mirrors LeakTable's own isLoading render exactly:
            bg-white rounded-lg border p-6 / space-y-4:
              h-6 w-1/4  (title bar)
              h-10        (full-width bar)
              3× h-12     (row blocks)                          */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-4">
            <Shimmer className="h-6 w-1/4" />
            <Shimmer className="h-10" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Shimmer key={i} className="h-12" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Visitor Journeys ── */}
      <div>
        <Shimmer className="h-7 w-44 mb-4" />

        {/* SessionsTable — mirrors the component's actual render while isLoading:
            The card wrapper + header + filters are ALWAYS rendered (not gated on
            isLoading). Only the table body swaps to loading blocks.             */}
        <div className="bg-white rounded-lg border border-gray-200">
          {/* Header + filters — always visible, same as real component */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3 mb-5">
              <Shimmer className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="space-y-1.5">
                <Shimmer className="h-6 w-28" />
                <Shimmer className="h-4 w-56" />
              </div>
            </div>
            {/* Filter grid: keyword(xl:col-span-2) + campaign + matchtype + device + outcome */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <Shimmer className="h-9 rounded-lg xl:col-span-2" />
              <Shimmer className="h-9 rounded-lg" />
              <Shimmer className="h-9 rounded-lg" />
              <Shimmer className="h-9 rounded-lg" />
              <Shimmer className="h-9 rounded-lg" />
            </div>
            {/* "Show ad filters" toggle link */}
            <Shimmer className="h-4 w-48 mt-2" />
          </div>
          {/* Table body loading state — mirrors SessionsTable isLoading: p-6 + 5×h-12 */}
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Shimmer key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

// =============================================================================
// CAMPAIGN STATUS SKELETON
// Mirrors the per-campaign status indicators in the verification panel.
// =============================================================================
export function CampaignStatusSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
        >
          <Shimmer className="h-3 w-3 rounded-full" />
          <Shimmer className="h-4 w-32" />
          <Shimmer className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// THAW PROGRESS BAR
// A thin bar at the top of the page that appears ONLY if the database response
// exceeds 2 seconds (as per PRD section 3.3).
// It animates: fast to 30% → slow crawl to 90% → snaps to 100% when done.
// =============================================================================
export function ThawProgressBar({ isVisible }: { isVisible: boolean }) {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      return;
    }

    // Phase 1: snap to 30% quickly (500ms)
    const timer1 = setTimeout(() => setProgress(30), 50);

    // Phase 2: crawl to 90% slowly (over ~25 seconds)
    const timer2 = setTimeout(() => setProgress(90), 500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed left-0 top-0 z-50 h-1 bg-indigo-500 transition-all"
      style={{
        width: `${progress}%`,
        // Slow crawl from 30% to 90% takes 25 seconds
        transitionDuration: progress === 90 ? "25000ms" : "500ms",
        transitionTimingFunction:
          progress === 90 ? "linear" : "cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    />
  );
}

// =============================================================================
// SNAP TO 100% — call this when data arrives to complete the progress bar
// Pass the setter from a useState that controls ThawProgressBar visibility.
// Usage:
//   const [thawVisible, setThawVisible] = useState(false)
//   const [thawDone, setThawDone] = useState(false)
//   // In your data fetch success callback:
//   snapProgressToComplete(setThawDone, setThawVisible)
// =============================================================================
export function snapProgressToComplete(
  setProgress: React.Dispatch<React.SetStateAction<number>>,
  onComplete: () => void
) {
  // Snap to 100%
  setProgress(100);
  // Hide bar 400ms later (fade out after completion)
  setTimeout(onComplete, 400);
}
