'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Search,
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Columns,
  Download,
} from 'lucide-react';

type ColKey = 'matchType' | 'date' | 'campaignName' | 'campaign' | 'device' | 'location' | 'duration' | 'adGroup' | 'adId';

const COL_LABELS: Record<ColKey, string> = {
  matchType:    'Match Type',
  date:         'Date',
  campaignName: 'Campaign Name',
  campaign:     'Campaign ID',
  device:       'Device',
  location:     'Location',
  duration:     'Duration',
  adGroup:      'Ad Group',
  adId:         'Ad ID',
};

const DEFAULT_COLS: Record<ColKey, boolean> = {
  matchType:    true,
  date:         true,
  campaignName: true,
  campaign:     false,
  device:       false,
  location:     true,
  duration:     true,
  adGroup:      false,
  adId:         false,
};

const MOBILE_COLS: Record<ColKey, boolean> = {
  matchType:    false,
  date:         false,
  campaignName: false,
  campaign:     false,
  device:       false,
  location:     false,
  duration:     false,
  adGroup:      false,
  adId:         false,
};

type SortKey = 'keyword' | 'matchType' | 'date' | 'campaignName' | 'campaign' | 'device' | 'location' | 'duration' | 'adGroup' | 'adId' | 'outcome';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-gray-400 inline ml-1" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-blue-600 inline ml-1" />
    : <ChevronDown className="w-3 h-3 text-blue-600 inline ml-1" />;
}
import { JourneyTimeline } from './JourneyTimeline';

interface Session {
  sessionId:        string;
  keyword:          string;
  matchType:        string;
  device:           string;
  startedAt:        string;
  totalDurationMs:  number | null;
  isBounce:         boolean;
  adGroupId:        string | null;
  adId:             string | null;
  adPosition:       string | null;
  city:             string | null;
  country:          string | null;
  googleCampaignId: string;
  campaignName:     string | null;
  campaignId:       string;
  eventCount:       number;
  hasSuccessEvent:  boolean;
  hasInteraction:   boolean;
}

interface Campaign {
  id:               string;
  googleCampaignId: string;
  slotNumber:       number;
  name:             string | null;
}

interface SessionsTableProps {
  campaigns: Campaign[];
  dateRange: { start: string; end: string };
  refreshTrigger: number;
}

// Converts an ISO 3166-1 alpha-2 code (e.g. "GB") to its flag emoji using
// Unicode regional indicator symbols — no extra dependency needed.
function countryFlag(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function formatLocation(city: string | null, country: string | null): string {
  if (!city && !country) return '—';
  const flag = countryFlag(country);
  const text = [city, country].filter(Boolean).join(', ');
  return flag ? `${flag} ${text}` : text;
}

// Converts an ISO 3166-1 alpha-2 code to its English display name, e.g. "GB" -> "United Kingdom"
function countryName(countryCode: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return '< 1s';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem  = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute: '2-digit',
  });
}

function DeviceIcon({ device }: { device: string }) {
  const d = (device || '').toLowerCase();
  if (d === 'mobile') return <Smartphone className="w-3.5 h-3.5" />;
  if (d === 'tablet') return <Tablet className="w-3.5 h-3.5" />;
  return <Monitor className="w-3.5 h-3.5" />;
}

/**
 * Must stay in step with the badge in JourneyTimeline.tsx — a session showing
 * one label in the table and another in its journey is the kind of
 * inconsistency that erodes trust in the whole dashboard.
 *
 * "No interaction" separates visitors who stayed but did nothing from those who
 * actually engaged. Bounce keeps its old meaning (gone almost immediately),
 * because is_bounce also drives the leaks report and the weekly email.
 */
function OutcomeBadge({
  isBounce, hasSuccessEvent, hasInteraction,
}: { isBounce: boolean; hasSuccessEvent: boolean; hasInteraction: boolean }) {
  if (hasSuccessEvent) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3" />
        Converted
      </span>
    );
  }
  if (isBounce) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <AlertCircle className="w-3 h-3" />
        Bounce
      </span>
    );
  }
  if (!hasInteraction) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
        title="Stayed on the page but never clicked, typed or scrolled"
      >
        <AlertCircle className="w-3 h-3" />
        No interaction
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      Engaged
    </span>
  );
}

export function SessionsTable({ campaigns, dateRange, refreshTrigger }: SessionsTableProps) {
  const [sessions,      setSessions]      = useState<Session[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [error,         setError]         = useState('');
  const [csvLoading,    setCsvLoading]    = useState(false);

  async function handleExportCSV() {
    setCsvLoading(true);
    try {
      const params = new URLSearchParams({ start: dateRange.start, end: dateRange.end });
      if (keyword)    params.set('keyword',    keyword);
      if (campaignId) params.set('campaignId', campaignId);
      if (matchType)  params.set('matchType',  matchType);
      if (device)     params.set('device',     device);
      if (outcome)    params.set('outcome',    outcome);
      if (adGroupId)  params.set('adGroupId',  adGroupId);
      if (adId)       params.set('adId',       adId);
      if (country)    params.set('country',    country);
      const res  = await fetch(`/api/export/sessions?${params}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `sessions_${dateRange.start}_to_${dateRange.end}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export error:', err);
    } finally {
      setCsvLoading(false);
    }
  }

  // Filters — main
  const [keyword,    setKeyword]    = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [matchType,  setMatchType]  = useState('');
  const [device,     setDevice]     = useState('');
  const [outcome,    setOutcome]    = useState('');
  const [country,    setCountry]    = useState('');
  // Filters — ad detail
  const [adGroupId,   setAdGroupId]   = useState('');
  const [adId,        setAdId]        = useState('');
  const [showAdFilters, setShowAdFilters] = useState(false);

  // Cached dropdown options — populated from sessions when no ad filter is active,
  // so selecting a value doesn't collapse the dropdown to a single item.
  const [adGroupOptions,   setAdGroupOptions]   = useState<string[]>([]);
  const [adIdOptions,      setAdIdOptions]      = useState<string[]>([]);
  const [countryOptions,   setCountryOptions]   = useState<string[]>([]);
  // Journey slide-over
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Column visibility — mobile shows only Keyword + Outcome by default
  const [cols, setCols] = useState<Record<ColKey, boolean>>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? MOBILE_COLS : DEFAULT_COLS
  );
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const toggleCol = (key: ColKey) => setCols(prev => ({ ...prev, [key]: !prev[key] }));

  // Auto-show the Device column when a Device filter is active, even if the
  // user hasn't enabled it in the column picker — they're looking for it.
  const effectiveCols: Record<ColKey, boolean> = { ...cols, device: cols.device || !!device };

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (col: SortKey) => {
    if (sortKey === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(col);
      setSortDir(col === 'date' || col === 'duration' ? 'desc' : 'asc');
    }
  };

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    }
    if (colPickerOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [colPickerOpen]);

  // Pagination — fetch 50 sessions (5 pages worth) per request, paginate
  // 10-at-a-time client-side within that batch, fetching the next/prev
  // batch from the server when crossing a 50-row boundary.
  const PAGE_SIZE = 10;
  const BATCH_SIZE = 50;
  const PAGES_PER_BATCH = BATCH_SIZE / PAGE_SIZE;

  const [batch, setBatch]         = useState(1);
  const [subPage, setSubPage]     = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
        page: String(batch),
        pageSize: String(BATCH_SIZE),
        sortKey,
        sortDir,
      });
      if (keyword)    params.set('keyword',    keyword);
      if (campaignId) params.set('campaignId', campaignId);
      if (matchType)  params.set('matchType',  matchType);
      if (device)     params.set('device',     device);
      if (outcome)    params.set('outcome',    outcome);
      if (adGroupId)  params.set('adGroupId',  adGroupId);
      if (adId)       params.set('adId',       adId);
      if (country)    params.set('country',    country);

      const res  = await fetch(`/api/sessions?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sessions');
      setSessions(data.sessions || []);
      setTotalCount(data.total ?? 0);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, [batch, keyword, campaignId, matchType, device, outcome, adGroupId, adId, country, dateRange, sortKey, sortDir, refreshTrigger]);

  // Reset to the first page/batch whenever filters, sort, or date range change
  useEffect(() => {
    setBatch(1);
    setSubPage(1);
  }, [keyword, campaignId, matchType, device, outcome, adGroupId, adId, country, dateRange, sortKey, sortDir]);

  useEffect(() => {
    const hasText = keyword || adGroupId || adId;
    const timer = setTimeout(loadSessions, hasText ? 400 : 0);
    return () => clearTimeout(timer);
  }, [loadSessions]);

  // Refresh dropdown option lists whenever sessions reload with no ad filter active.
  // Keeping them frozen while a filter IS active prevents the selected value from
  // disappearing from its own dropdown.
  useEffect(() => {
    if (!adGroupId && !adId) {
      const groups = [...new Set(sessions.map(s => s.adGroupId).filter((v): v is string => !!v))].sort();
      const ids    = [...new Set(sessions.map(s => s.adId).filter((v): v is string => !!v))].sort();
      if (groups.length) setAdGroupOptions(groups);
      if (ids.length)    setAdIdOptions(ids);
    }
    if (!country) {
      const countries = [...new Set(sessions.map(s => s.country).filter((v): v is string => !!v))].sort();
      if (countries.length) setCountryOptions(countries);
    }
  }, [sessions]);

  const totalPages   = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const overallPage  = (batch - 1) * PAGES_PER_BATCH + subPage;
  const pageRows     = sessions.slice((subPage - 1) * PAGE_SIZE, subPage * PAGE_SIZE);

  const goToPrevPage = () => {
    if (subPage > 1) {
      setSubPage(p => p - 1);
    } else if (batch > 1) {
      setBatch(b => b - 1);
      setSubPage(PAGES_PER_BATCH);
    }
  };

  const goToNextPage = () => {
    if (overallPage >= totalPages) return;
    if (subPage < PAGES_PER_BATCH) {
      setSubPage(p => p + 1);
    } else {
      setBatch(b => b + 1);
      setSubPage(1);
    }
  };

  return (
    <>
      <div className="bg-white rounded-b-lg border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">All Sessions</h2>
                <p className="text-sm text-gray-600">Every visit from your Google Ads campaigns</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
            {/* Download CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={csvLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600 disabled:opacity-50"
            >
              {csvLoading
                ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              Export CSV
            </button>

            {/* Column picker */}
            <div className="relative flex-shrink-0" ref={colPickerRef}>
              <button
                type="button"
                onClick={() => setColPickerOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
              >
                <Columns className="w-3.5 h-3.5" />
                Columns
                {Object.values(cols).filter(Boolean).length !== Object.keys(cols).length && (
                  <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
                    {Object.values(cols).filter(Boolean).length}
                  </span>
                )}
              </button>

              {colPickerOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-44">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Toggle columns</p>
                  <div className="space-y-1">
                    {(Object.keys(COL_LABELS) as ColKey[]).map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={cols[key]}
                          onChange={() => toggleCol(key)}
                          className="w-3.5 h-3.5 rounded accent-blue-600"
                        />
                        <span className="text-xs text-gray-700 group-hover:text-gray-900 select-none">
                          {COL_LABELS[key]}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCols(DEFAULT_COLS)}
                    className="mt-3 w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors text-center"
                  >
                    Reset to default
                  </button>
                </div>
              )}
            </div>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3">
            {/* Keyword search */}
            <div className="relative xl:col-span-2">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="Search keyword..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Campaign */}
            <select
              value={campaignId}
              onChange={e => setCampaignId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="" style={{ paddingRight: '1rem' }}>All Campaigns</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id} style={{ paddingRight: '1rem' }}>
                  {c.name ? `${c.name} (${c.googleCampaignId})` : `Campaign ${c.slotNumber} (${c.googleCampaignId})`}
                </option>
              ))}
            </select>

            {/* Match type */}
            <select
              value={matchType}
              onChange={e => setMatchType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Match Types</option>
              <option value="exact">Exact</option>
              <option value="phrase">Phrase</option>
              <option value="broad">Broad</option>
            </select>

            {/* Device */}
            <select
              value={device}
              onChange={e => setDevice(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Devices</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </select>

            {/* Outcome */}
            <select
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Outcomes</option>
              <option value="converted">Converted</option>
              <option value="bounce">Bounced</option>
              <option value="engaged">Engaged</option>
              <option value="no_interaction">No interaction</option>
            </select>

            {/* Country */}
            <select
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Countries</option>
              {countryOptions.length === 0 && (
                <option disabled value="">No data yet</option>
              )}
              {countryOptions.map(v => (
                <option key={v} value={v}>{countryFlag(v)} {countryName(v)}</option>
              ))}
            </select>
          </div>

          {/* Ad-detail filters — collapsed by default */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowAdFilters(v => !v)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              {showAdFilters ? '▲ Hide' : '▼ Show'} ad filters (Ad Group, Ad ID)
              {(adGroupId || adId) && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px]">
                  {[adGroupId, adId].filter(Boolean).length}
                </span>
              )}
            </button>

            {showAdFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                {/* Ad Group ID */}
                <select
                  value={adGroupId}
                  onChange={e => setAdGroupId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Ad Groups</option>
                  {adGroupOptions.length === 0 && (
                    <option disabled value="">No data yet</option>
                  )}
                  {adGroupOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>

                {/* Ad ID */}
                <select
                  value={adId}
                  onChange={e => setAdId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Ads</option>
                  {adIdOptions.length === 0 && (
                    <option disabled value="">No data yet</option>
                  )}
                  {adIdOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!isLoading && totalCount > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              Showing {(overallPage - 1) * PAGE_SIZE + 1}–{Math.min(overallPage * PAGE_SIZE, totalCount)} of {totalCount} session{totalCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="p-6 animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-red-600 mb-3">{error}</p>
            <button
              onClick={loadSessions}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Retry
            </button>
          </div>
        ) : sessions.length === 0 ? (
          (() => {
            const hasFilters = !!(keyword || campaignId || matchType || device || outcome || adGroupId || adId || country);
            return hasFilters ? (
              /* Filters active — nothing matched */
              <div className="p-10 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-gray-700 font-medium">No sessions match your filters</p>
                <p className="text-gray-400 text-sm mt-1">Try clearing a filter or widening the date range</p>
                <button
                  onClick={() => { setKeyword(''); setCampaignId(''); setMatchType(''); setDevice(''); setOutcome(''); setAdGroupId(''); setAdId(''); setCountry(''); }}
                  className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              /* No filters — new user waiting for first data */
              <div className="p-10 text-center">
                <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-blue-400" />
                </div>
                <p className="text-gray-700 font-semibold mb-1">No sessions yet</p>
                <p className="text-gray-500 text-sm mb-5">
                  Sessions will appear here as soon as your first Google Ads visitor arrives.
                </p>
                <div className="max-w-xs mx-auto bg-gray-50 rounded-lg border border-gray-200 p-4 text-left text-sm text-gray-600 space-y-2">
                  <p className="font-medium text-gray-700">Checklist:</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">①</span> Snippet installed on every page of your site</li>
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">②</span> Google Ads campaigns are live</li>
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">③</span> ValueTrack <code className="bg-gray-100 px-1 rounded">&#123;keyword&#125;</code> in your final URL suffix</li>
                  </ul>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {(() => {
                    const thClass = "px-2.5 sm:px-3.5 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors";
                    const thR = thClass.replace('text-left', 'text-right');
                    return (<>
                      <th className={thClass} onClick={() => handleSort('keyword')}>Keyword <SortIcon col="keyword" sortKey={sortKey} sortDir={sortDir} /></th>
                      {cols.matchType && <th className={thClass} onClick={() => handleSort('matchType')}>Match Type <SortIcon col="matchType" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {cols.date      && <th className={thClass} onClick={() => handleSort('date')}>Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {cols.campaignName && <th className={thClass} onClick={() => handleSort('campaignName')}>Campaign Name <SortIcon col="campaignName" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {cols.campaign  && <th className={thClass} onClick={() => handleSort('campaign')}>Campaign ID <SortIcon col="campaign" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {effectiveCols.device && <th className={thClass} onClick={() => handleSort('device')}>Device <SortIcon col="device" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {cols.location  && <th className={thClass} onClick={() => handleSort('location')}>Location <SortIcon col="location" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {cols.duration  && <th className={thR}     onClick={() => handleSort('duration')}>Duration <SortIcon col="duration" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {cols.adGroup   && <th className={thClass} onClick={() => handleSort('adGroup')}>Ad Group <SortIcon col="adGroup" sortKey={sortKey} sortDir={sortDir} /></th>}
                      {cols.adId      && <th className={thClass} onClick={() => handleSort('adId')}>Ad ID <SortIcon col="adId" sortKey={sortKey} sortDir={sortDir} /></th>}
                      <th className={thClass} onClick={() => handleSort('outcome')}>Outcome <SortIcon col="outcome" sortKey={sortKey} sortDir={sortDir} /></th>
                    </>);
                  })()}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {pageRows.map(s => (
                  <tr
                    key={s.sessionId}
                    onClick={() => setSelectedSession(s)}
                    className="hover:bg-blue-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{s.keyword}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </td>
                    {cols.matchType && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {s.matchType || '—'}
                        </span>
                      </td>
                    )}
                    {cols.date && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(s.startedAt)}
                      </td>
                    )}
                    {cols.campaignName && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap text-sm text-gray-600">
                        {s.campaignName || '—'}
                      </td>
                    )}
                    {cols.campaign && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap text-sm text-gray-600">
                        {s.googleCampaignId}
                      </td>
                    )}
                    {effectiveCols.device && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                          <DeviceIcon device={s.device} />
                          {s.device || 'Desktop'}
                        </span>
                      </td>
                    )}
                    {cols.location && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap text-sm text-gray-600">
                        {formatLocation(s.city, s.country)}
                      </td>
                    )}
                    {cols.duration && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {formatDuration(s.totalDurationMs)}
                        </span>
                      </td>
                    )}
                    {cols.adGroup && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap">
                        <span className="text-sm text-gray-500 font-mono">{s.adGroupId ?? '—'}</span>
                      </td>
                    )}
                    {cols.adId && (
                      <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap">
                        <span className="text-sm text-gray-500 font-mono">{s.adId ?? '—'}</span>
                      </td>
                    )}
                    <td className="px-2.5 sm:px-3.5 py-2 whitespace-nowrap">
                      <OutcomeBadge isBounce={s.isBounce} hasSuccessEvent={s.hasSuccessEvent} hasInteraction={s.hasInteraction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalCount > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2 bg-white">
            <p className="text-xs text-gray-500">
              Showing {(overallPage - 1) * PAGE_SIZE + 1}–{Math.min(overallPage * PAGE_SIZE, totalCount)} of {totalCount} session{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevPage}
                disabled={overallPage === 1}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-600 font-medium px-1">
                Page {overallPage} of {totalPages}
              </span>
              <button
                onClick={goToNextPage}
                disabled={overallPage === totalPages}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Click any row to view the full visitor journey for that session.
          </p>
        </div>
      </div>

      {/* Journey slide-over */}
      {selectedSession && (
        <JourneyTimeline
          keyword={selectedSession.keyword}
          matchType={selectedSession.matchType}
          dateRange={dateRange}
          sessionId={selectedSession.sessionId}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </>
  );
}
