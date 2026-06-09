'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Columns,
} from 'lucide-react';

type ColKey = 'matchType' | 'date' | 'campaign' | 'device' | 'duration' | 'adGroup' | 'adId' | 'position';

const COL_LABELS: Record<ColKey, string> = {
  matchType: 'Match Type',
  date:      'Date',
  campaign:  'Campaign',
  device:    'Device',
  duration:  'Duration',
  adGroup:   'Ad Group',
  adId:      'Ad ID',
  position:  'Ad Position',
};

const DEFAULT_COLS: Record<ColKey, boolean> = {
  matchType: true,
  date:      true,
  campaign:  true,
  device:    true,
  duration:  true,
  adGroup:   false,
  adId:      false,
  position:  false,
};
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
  googleCampaignId: string;
  campaignId:       string;
  eventCount:       number;
  hasSuccessEvent:  boolean;
}

interface Campaign {
  id:               string;
  googleCampaignId: string;
  slotNumber:       number;
}

interface SessionsTableProps {
  campaigns: Campaign[];
  dateRange: { start: string; end: string };
  refreshTrigger: number;
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

function OutcomeBadge({ isBounce, hasSuccessEvent }: { isBounce: boolean; hasSuccessEvent: boolean }) {
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
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      Engaged
    </span>
  );
}

export function SessionsTable({ campaigns, dateRange, refreshTrigger }: SessionsTableProps) {
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [error,      setError]      = useState('');

  // Filters — main
  const [keyword,    setKeyword]    = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [matchType,  setMatchType]  = useState('');
  const [device,     setDevice]     = useState('');
  const [outcome,    setOutcome]    = useState('');
  // Filters — ad detail
  const [adGroupId,   setAdGroupId]   = useState('');
  const [adId,        setAdId]        = useState('');
  const [adPosition,  setAdPosition]  = useState('');
  const [showAdFilters, setShowAdFilters] = useState(false);

  // Cached dropdown options — populated from sessions when no ad filter is active,
  // so selecting a value doesn't collapse the dropdown to a single item.
  const [adGroupOptions,   setAdGroupOptions]   = useState<string[]>([]);
  const [adIdOptions,      setAdIdOptions]      = useState<string[]>([]);
  const [adPositionOptions, setAdPositionOptions] = useState<string[]>([]);
  // Journey slide-over
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Column visibility
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const toggleCol = (key: ColKey) => setCols(prev => ({ ...prev, [key]: !prev[key] }));

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

  // Pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ start: dateRange.start, end: dateRange.end });
      if (keyword)    params.set('keyword',    keyword);
      if (campaignId) params.set('campaignId', campaignId);
      if (matchType)  params.set('matchType',  matchType);
      if (device)     params.set('device',     device);
      if (outcome)    params.set('outcome',    outcome);
      if (adGroupId)  params.set('adGroupId',  adGroupId);
      if (adId)       params.set('adId',       adId);
      if (adPosition) params.set('adPosition', adPosition);

      const res  = await fetch(`/api/sessions?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sessions');
      setSessions(data.sessions || []);
      setPage(1);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, [keyword, campaignId, matchType, device, outcome, adGroupId, adId, adPosition, dateRange, refreshTrigger]);

  useEffect(() => {
    const hasText = keyword || adGroupId || adId || adPosition;
    const timer = setTimeout(loadSessions, hasText ? 400 : 0);
    return () => clearTimeout(timer);
  }, [loadSessions]);

  // Refresh dropdown option lists whenever sessions reload with no ad filter active.
  // Keeping them frozen while a filter IS active prevents the selected value from
  // disappearing from its own dropdown.
  useEffect(() => {
    if (!adGroupId && !adId && !adPosition) {
      const groups = [...new Set(sessions.map(s => s.adGroupId).filter((v): v is string => !!v))].sort();
      const ids    = [...new Set(sessions.map(s => s.adId).filter((v): v is string => !!v))].sort();
      const pos    = [...new Set(sessions.map(s => s.adPosition).filter((v): v is string => !!v))].sort();
      if (groups.length) setAdGroupOptions(groups);
      if (ids.length)    setAdIdOptions(ids);
      if (pos.length)    setAdPositionOptions(pos);
    }
  }, [sessions]);

  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const pageRows = sessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">All Sessions</h2>
                <p className="text-sm text-gray-600">Every visit from your Google Ads campaigns</p>
              </div>
            </div>

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

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
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
              <option value="">All Campaigns</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  Campaign {c.slotNumber} ({c.googleCampaignId})
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
            </select>
          </div>

          {/* Ad-detail filters — collapsed by default */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowAdFilters(v => !v)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              {showAdFilters ? '▲ Hide' : '▼ Show'} ad filters (Ad Group, Ad ID, Position)
              {(adGroupId || adId || adPosition) && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px]">
                  {[adGroupId, adId, adPosition].filter(Boolean).length}
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

                {/* Ad Position — shows actual values e.g. 1t1, 1t2 */}
                <select
                  value={adPosition}
                  onChange={e => setAdPosition(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Positions</option>
                  {adPositionOptions.length === 0 && (
                    <option disabled value="">No data yet</option>
                  )}
                  {adPositionOptions.map(v => (
                    <option key={v} value={v}>
                      {v}{v.includes('t') ? ' — top of page' : v === 'none' ? ' — display network' : ' — other'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!isLoading && sessions.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sessions.length)} of {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              {sessions.length === 100 ? ' (max 100 loaded)' : ''}
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
            const hasFilters = !!(keyword || campaignId || matchType || device || outcome || adGroupId || adId || adPosition);
            return hasFilters ? (
              /* Filters active — nothing matched */
              <div className="p-10 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-gray-700 font-medium">No sessions match your filters</p>
                <p className="text-gray-400 text-sm mt-1">Try clearing a filter or widening the date range</p>
                <button
                  onClick={() => { setKeyword(''); setCampaignId(''); setMatchType(''); setDevice(''); setOutcome(''); setAdGroupId(''); setAdId(''); setAdPosition(''); }}
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
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keyword</th>
                  {cols.matchType && <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match Type</th>}
                  {cols.date      && <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>}
                  {cols.campaign  && <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign</th>}
                  {cols.device    && <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>}
                  {cols.duration  && <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>}
                  {cols.adGroup   && <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ad Group</th>}
                  {cols.adId      && <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ad ID</th>}
                  {cols.position  && <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ad Position</th>}
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outcome</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {pageRows.map(s => (
                  <tr
                    key={s.sessionId}
                    onClick={() => setSelectedSession(s)}
                    className="hover:bg-blue-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{s.keyword}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </td>
                    {cols.matchType && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {s.matchType || '—'}
                        </span>
                      </td>
                    )}
                    {cols.date && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(s.startedAt)}
                      </td>
                    )}
                    {cols.campaign && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                        {s.googleCampaignId}
                      </td>
                    )}
                    {cols.device && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                          <DeviceIcon device={s.device} />
                          {s.device || 'Desktop'}
                        </span>
                      </td>
                    )}
                    {cols.duration && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {formatDuration(s.totalDurationMs)}
                        </span>
                      </td>
                    )}
                    {cols.adGroup && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-500 font-mono">{s.adGroupId ?? '—'}</span>
                      </td>
                    )}
                    {cols.adId && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-500 font-mono">{s.adId ?? '—'}</span>
                      </td>
                    )}
                    {cols.position && (
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-500">{s.adPosition ?? '—'}</span>
                      </td>
                    )}
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      <OutcomeBadge isBounce={s.isBounce} hasSuccessEvent={s.hasSuccessEvent} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && sessions.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2 bg-white">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sessions.length)} of {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-600 font-medium px-1">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
