'use client';

interface StatusIndicatorProps {
  isLive: boolean;
  lastUpdate?: Date | null;
}

export function StatusIndicator({ isLive, lastUpdate }: StatusIndicatorProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
          isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
        }`} />
        <span className={`font-semibold ${
          isLive ? 'text-green-700' : 'text-gray-600'
        }`}>
          {isLive ? 'Live' : 'Awaiting Data'}
        </span>
      </div>
      {lastUpdate && (
        <span className="text-sm text-gray-500">
          Last data: {new Date(lastUpdate).toLocaleString()}
        </span>
      )}
    </div>
  );
}