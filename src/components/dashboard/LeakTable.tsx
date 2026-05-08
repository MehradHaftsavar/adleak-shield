'use client';

import { useState, useEffect } from 'react';
import { Download, TrendingDown, AlertTriangle } from 'lucide-react';
import { generateNegativeKeywordCSV, downloadCSV } from '@/lib/utils/csv-export';

interface Leak {
  keyword: string;
  matchType: string;
  avgCpc: number;
  totalClicks: number;
  bounceClicks: number;
  bounceRate: number;
  estimatedWaste: number;
}

interface LeakTableData {
  leaks: Leak[];
  summary: {
    totalWaste: number;
    totalBounceClicks: number;
    totalLeaks: number;
    dateRange: { start: string; end: string };
  };
}

interface LeakTableProps {
  dateRange: {
    start: string;
    end: string;
  };
  refreshTrigger: number;
}

export function LeakTable({ dateRange, refreshTrigger }: LeakTableProps) {
  const [data, setData] = useState<LeakTableData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLeaks();
  }, [dateRange, refreshTrigger]);

  const loadLeaks = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      });
      
      const res = await fetch(`/api/leaks?${params}`);
      if (res.ok) {
        const leakData = await res.json();
        setData(leakData);
      } else {
        setError('Failed to load leak data');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data || data.leaks.length === 0) return;

    const keywords = data.leaks.map(leak => ({
      keyword: leak.keyword,
      matchType: leak.matchType,
    }));

    const csv = generateNegativeKeywordCSV(keywords);
    const filename = `negative-keywords-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadLeaks}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.leaks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <TrendingDown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Leaks Detected
        </h3>
        <p className="text-gray-600">
          Great news! No wasted spend found in the selected date range.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Leak Table</h2>
              <p className="text-sm text-gray-600">
                Keywords wasting your ad spend
              </p>
            </div>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={data.leaks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Negative Keywords</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-4 sm:gap-6 text-sm">
          <div>
            <span className="text-gray-600">Total Waste:</span>
            <span className="ml-2 font-bold text-red-600">
              £{data.summary.totalWaste.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Bounce Clicks:</span>
            <span className="ml-2 font-semibold text-gray-900">
              {data.summary.totalBounceClicks}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Keyword
              </th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Match Type
              </th>
              <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Clicks
              </th>
              <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bounce Clicks
              </th>
              <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bounce Rate
              </th>
              <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Est. Wasted Spend
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.leaks.map((leak, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                  <span className="font-medium text-gray-900">{leak.keyword}</span>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {leak.matchType}
                  </span>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  {leak.totalClicks}
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  {leak.bounceClicks}
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm">
                  <span className={`font-semibold ${
                    leak.bounceRate > 80 ? 'text-red-600' :
                    leak.bounceRate > 50 ? 'text-orange-600' :
                    'text-gray-900'
                  }`}>
                    {leak.bounceRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-red-600">
                  £{leak.estimatedWaste.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-600">
          💡 <strong>Tip:</strong> Export these as negative keywords to prevent future wasted spend. 
          Calculated using your campaign's actual CPC at the time of each click.
        </p>
      </div>
    </div>
  );
}