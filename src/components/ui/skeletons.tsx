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
