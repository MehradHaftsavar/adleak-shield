'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { JourneyTimeline } from './JourneyTimeline';

interface Session {
  sessionId:        string;
  keyword:          string;
  matchType:        string;
  device:           string;
  startedAt:        string;
  totalDurationMs:  number | null;
  isBounce:         boolean;
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

  // Filters
  const [keyword,    setKeyword]    = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [matchType,  setMatchType]  = useState('');
  const [device,     setDevice]     = useState('');
  const [outcome,    setOutcome]    = useState('');
  // Journey slide-over
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

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
  }, [keyword, campaignId, matchType, device, outcome, dateRange, refreshTrigger]);

  useEffect(() => {
    const timer = setTimeout(loadSessions, keyword ? 400 : 0);
    return () => clearTimeout(timer);
  }, [loadSessions]);

  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const pageRows = sessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">All Sessions</h2>
              <p className="text-sm text-gray-600">Every visit from your Google Ads campaigns</p>
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
          <div className="p-10 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No sessions found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or date range</p>
          </div>
        ) : (
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
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Device
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Duration
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Outcome
                  </th>
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
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {s.matchType || '—'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(s.startedAt)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                      {s.googleCampaignId}
                    </td>
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                        <DeviceIcon device={s.device} />
                        {s.device || 'Desktop'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-right hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {formatDuration(s.totalDurationMs)}
                      </span>
                    </td>
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
          <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between gap-4 bg-white">
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
