'use client';

import { useState, useEffect, useMemo } from 'react';
import { Download, TrendingDown, AlertTriangle, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { JourneyTimeline } from './JourneyTimeline';
import { generateNegativeKeywordCSV, downloadCSV } from '@/lib/utils/csv-export';

interface Leak {
  keyword: string;
  matchType: string;
  campaignId: string;
  googleCampaignId: string;
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
  dateRange: { start: string; end: string };
  refreshTrigger: number;
}

type SortKey = 'keyword' | 'matchType' | 'googleCampaignId' | 'totalClicks' | 'bounceClicks' | 'bounceRate' | 'estimatedWaste';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 inline ml-1" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 text-blue-600 inline ml-1" />
    : <ChevronDown className="w-3.5 h-3.5 text-blue-600 inline ml-1" />;
}

export function LeakTable({ dateRange, refreshTrigger }: LeakTableProps) {
  const [data, setData] = useState<LeakTableData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Journey Timeline
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [selectedMatchType, setSelectedMatchType] = useState<string>('');

  // Filters
  const [filterMatchType, setFilterMatchType] = useState('');
  const [filterCampaign, setFilterCampaign] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('estimatedWaste');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => { loadLeaks(); }, [dateRange, refreshTrigger]);

  const loadLeaks = async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ start: dateRange.start, end: dateRange.end });
      const res = await fetch(`/api/leaks?${params}`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        setError(json.error || 'Failed to load leak data');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data || data.leaks.length === 0) return;
    const csv = generateNegativeKeywordCSV(data.leaks.map(l => ({ keyword: l.keyword, matchType: l.matchType })));
    downloadCSV(csv, `negative-keywords-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleSort = (col: SortKey) => {
    if (sortKey === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(col);
      setSortDir(col === 'keyword' || col === 'matchType' || col === 'googleCampaignId' ? 'asc' : 'desc');
    }
  };

  // Derived filter options
  const matchTypes = useMemo(() => [...new Set(data?.leaks.map(l => l.matchType) ?? [])].sort(), [data]);
  const campaigns = useMemo(() => [...new Map(data?.leaks.map(l => [l.campaignId, l.googleCampaignId]) ?? []).entries()], [data]);

  // Filtered + sorted rows
  const rows = useMemo(() => {
    let list = data?.leaks ?? [];
    if (filterMatchType) list = list.filter(l => l.matchType === filterMatchType);
    if (filterCampaign) list = list.filter(l => l.campaignId === filterCampaign);

    return [...list].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      let cmp = typeof aVal === 'string'
        ? aVal.localeCompare(bVal as string)
        : (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, filterMatchType, filterCampaign, sortKey, sortDir]);

  const thClass = "px-4 sm:px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors";

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-12 bg-gray-200 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-red-600">{error}</p>
        <button onClick={loadLeaks} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.leaks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <TrendingDown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Leaks Detected</h3>
        <p className="text-gray-600">Great news! No wasted spend found in the selected date range.</p>
      </div>
    );
  }

  return (
    <>
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
              <p className="text-sm text-gray-600">Keywords wasting your ad spend</p>
            </div>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Negative Keywords</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 sm:gap-6 text-sm mb-4">
          <div>
            <span className="text-gray-600">Total Waste:</span>
            <span className="ml-2 font-bold text-red-600">£{data.summary.totalWaste.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-600">Bounce Clicks:</span>
            <span className="ml-2 font-semibold text-gray-900">{data.summary.totalBounceClicks}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterMatchType}
            onChange={e => setFilterMatchType(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Match Types</option>
            {matchTypes.map(mt => <option key={mt} value={mt}>{mt}</option>)}
          </select>

          <select
            value={filterCampaign}
            onChange={e => setFilterCampaign(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Campaigns</option>
            {campaigns.map(([id, gid]) => <option key={id} value={id}>{gid}</option>)}
          </select>

          {(filterMatchType || filterCampaign) && (
            <button
              onClick={() => { setFilterMatchType(''); setFilterCampaign(''); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}

          {(filterMatchType || filterCampaign) && (
            <span className="text-sm text-gray-500 self-center">{rows.length} of {data.leaks.length} rows</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={`${thClass} text-left`} onClick={() => handleSort('keyword')}>
                Keyword <SortIcon col="keyword" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`${thClass} text-left`} onClick={() => handleSort('matchType')}>
                Match Type <SortIcon col="matchType" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`${thClass} text-left`} onClick={() => handleSort('googleCampaignId')}>
                Campaign <SortIcon col="googleCampaignId" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('totalClicks')}>
                Total Clicks <SortIcon col="totalClicks" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('bounceClicks')}>
                Bounce Clicks <SortIcon col="bounceClicks" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('bounceRate')}>
                Bounce Rate <SortIcon col="bounceRate" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('estimatedWaste')}>
                Est. Wasted Spend <SortIcon col="estimatedWaste" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((leak, idx) => (
              <tr
                key={idx}
                className="hover:bg-blue-50 transition-colors cursor-pointer group"
                onClick={() => { setSelectedKeyword(leak.keyword); setSelectedMatchType(leak.matchType); }}
              >
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{leak.keyword}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {leak.matchType}
                  </span>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {leak.googleCampaignId}
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  {leak.totalClicks}
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  {leak.bounceClicks}
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm">
                  <span className={`font-semibold ${leak.bounceRate > 80 ? 'text-red-600' : leak.bounceRate > 50 ? 'text-orange-600' : 'text-gray-900'}`}>
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

      {/* Footer */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-600">
          💡 <strong>Tip:</strong> Export these as negative keywords to prevent future wasted spend.
          Click any column header to sort. Click any row to view visitor journey sessions.
        </p>
      </div>
    </div>

    {selectedKeyword && (
      <JourneyTimeline
        keyword={selectedKeyword}
        matchType={selectedMatchType}
        dateRange={dateRange}
        onClose={() => { setSelectedKeyword(null); setSelectedMatchType(''); }}
      />
    )}
    </>
  );
}
