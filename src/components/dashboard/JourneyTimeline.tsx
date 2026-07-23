'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  Clock,
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSummary {
  sessionId:       string;
  keyword:         string;
  matchType:       string;
  device:          string;
  startedAt:       string;
  totalDurationMs: number | null;
  isBounce:        boolean;
  eventCount:      number;
  hasSuccessEvent: boolean;
}

interface JourneyEvent {
  eventId:        string;
  eventType:      'pageview' | 'click' | 'success_event' | 'form_interact';
  pagePath:       string | null;
  elementTag:     string | null;
  elementHref:    string | null;
  elementText:    string | null;
  scrollDepthPct: number | null;
  dwellTimeMs:    number | null;
  occurredAt:     string;
}

interface JourneyDetail {
  session: Omit<SessionSummary, 'eventCount' | 'hasSuccessEvent'>;
  events:  JourneyEvent[];
}

export interface JourneyTimelineProps {
  keyword:    string;
  matchType:  string;
  dateRange:  { start: string; end: string };
  onClose:    () => void;
  sessionId?: string; // if set, skip sessions list and open this session directly
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (!ms) return '< 1s';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem  = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

function DeviceIcon({ device }: { device: string }) {
  const d = (device || '').toLowerCase();
  if (d === 'mobile') return <Smartphone className="w-4 h-4" />;
  if (d === 'tablet') return <Tablet className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
}

// ─── Sessions List View ────────────────────────────────────────────────────────

function SessionsList({
  keyword,
  sessions,
  isLoading,
  error,
  onSelectSession,
}: {
  keyword:         string;
  sessions:        SessionSummary[];
  isLoading:       boolean;
  error:           string;
  onSelectSession: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>No sessions found for &quot;{keyword}&quot; in this date range.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {sessions.map(s => (
        <button
          key={s.sessionId}
          onClick={() => onSelectSession(s.sessionId)}
          className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors flex items-start justify-between gap-3 group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-1">
              {formatDate(s.startedAt)} · {formatTime(s.startedAt)}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              {s.hasSuccessEvent ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3" />
                  Converted
                </span>
              ) : s.isBounce ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  <AlertCircle className="w-3 h-3" />
                  Bounce
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  Engaged
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <DeviceIcon device={s.device} />
                {s.device || 'Desktop'}
              </span>

              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                {formatDuration(s.totalDurationMs)}
              </span>

              <span className="text-xs text-gray-400">
                {s.eventCount} event{s.eventCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 mt-3 shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─── Timeline View ─────────────────────────────────────────────────────────────

function TimelineView({
  detail,
  isLoading,
  error,
  domain,
}: {
  detail:    JourneyDetail | null;
  isLoading: boolean;
  error:     string;
  domain:    string | null;
}) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        <div className="h-16 bg-gray-100 rounded-lg" />
        <div className="space-y-2 mt-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  if (!detail) return null;

  const { session, events } = detail;

  return (
    <div className="flex flex-col h-full">
      {/* Session summary bar */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {session.isBounce ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <AlertCircle className="w-3 h-3" />
              Bounce
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3" />
              Engaged
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <DeviceIcon device={session.device} />
            {session.device || 'Desktop'}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <Clock className="w-3 h-3" />
            {formatDuration(session.totalDurationMs)} total
          </span>
          <span className="text-xs text-gray-400">
            {session.matchType} match
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {formatDate(session.startedAt)} at {formatTime(session.startedAt)}
        </p>
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm">
          No events recorded for this session.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="relative px-4 py-4">
            <div className="absolute left-[1.85rem] top-4 bottom-4 w-0.5 bg-gray-200" />
            <div className="space-y-3">
              {events.map((event, idx) => (
                <TimelineEventRow key={event.eventId} event={event} index={idx} domain={domain} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineEventRow({ event, index, domain }: { event: JourneyEvent; index: number; domain: string | null }) {
  const isSuccess      = event.eventType === 'success_event';
  const isPageview     = event.eventType === 'pageview';
  const isFormInteract = event.eventType === 'form_interact';

  const dotColour = isSuccess
    ? 'bg-green-500 ring-green-300'
    : isPageview
    ? 'bg-blue-400 ring-blue-200'
    : isFormInteract
    ? 'bg-amber-400 ring-amber-200'
    : 'bg-gray-400 ring-gray-200';

  const pagePath = event.pagePath || '/';
  const pageLabel = domain
    ? `${domain}${pagePath === '/' ? '' : pagePath}`  // myshop.com or myshop.com/contact-us
    : pagePath;

  let label = '';
  if (isPageview) {
    label = `Visited ${pageLabel}`;
  } else if (isSuccess) {
    const href = event.elementHref || '';
    if (href.startsWith('tel:')) {
      label = `Conversion: Called ${href.slice(4)}`;
    } else if (href.startsWith('mailto:')) {
      label = `Conversion: Emailed ${href.slice(7)}`;
    } else if (href.includes('wa.me') || href.includes('wa.link')) {
      label = 'Conversion: Messaged via WhatsApp';
    } else if (event.elementTag === 'form') {
      label = event.elementText
        ? `Conversion: Submitted form "${event.elementText}"`
        : 'Conversion: Submitted a form';
    } else if (event.elementText) {
      label = `Conversion: Clicked "${event.elementText}"`;
    } else if (!href && !event.elementTag) {
      label = `Conversion: Reached ${pageLabel}`;
    } else {
      label = `Conversion: ${href || event.elementTag || 'Success event'}`;
    }
  } else if (isFormInteract) {
    label = 'Started filling out a form';
  } else {
    const what = event.elementTag === 'a' ? 'link' : event.elementTag === 'button' ? 'button' : 'element';
    label = event.elementText
      ? `Clicked "${event.elementText}" ${what}`
      : event.elementHref
      ? `Clicked ${what} (${event.elementHref})`
      : `Clicked ${what}`;
  }

  return (
    <div className="relative flex items-start gap-3 pl-6">
      <div className={`absolute left-0 mt-1 w-3.5 h-3.5 rounded-full border-2 border-white shrink-0 ring-2 ${dotColour}`} />

      <div className={`flex-1 min-w-0 rounded-lg border p-3 ${isSuccess ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
        <p className={`text-sm font-medium break-words ${isSuccess ? 'text-green-800' : 'text-gray-900'}`}>
          {label}
        </p>

        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {!isPageview && (
            <span className="text-xs text-gray-400 truncate max-w-[200px]">
              {pageLabel}
            </span>
          )}
          {event.dwellTimeMs != null && (
            <span className="text-xs text-gray-500">
              {formatDuration(event.dwellTimeMs)} dwell
            </span>
          )}
          {event.scrollDepthPct != null && (
            <span className="text-xs text-gray-500">
              {event.scrollDepthPct}% scrolled
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {formatTime(event.occurredAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main exported component ───────────────────────────────────────────────────

export function JourneyTimeline({ keyword, matchType, dateRange, onClose, sessionId }: JourneyTimelineProps) {
  const directMode = !!sessionId;
  const [view, setView] = useState<'sessions' | 'timeline'>(directMode ? 'timeline' : 'sessions');

  const [domain, setDomain] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/domain')
      .then(r => r.json())
      .then(data => { if (data.domain) setDomain(data.domain); })
      .catch(() => {/* non-critical, falls back to path only */});
  }, []);

  const [sessions,        setSessions]        = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(!directMode);
  const [sessionsError,   setSessionsError]   = useState('');

  const [journeyDetail,  setJourneyDetail]  = useState<JourneyDetail | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(directMode);
  const [journeyError,   setJourneyError]   = useState('');

  // Load sessions list (only when opened from LeakTable)
  useEffect(() => {
    if (directMode) return;

    const params = new URLSearchParams({
      keyword,
      start: dateRange.start,
      end:   dateRange.end,
    });

    setSessionsLoading(true);
    setSessionsError('');

    fetch(`/api/journey/sessions?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setSessions(data.sessions);
      })
      .catch(err => setSessionsError(err.message || 'Failed to load sessions'))
      .finally(() => setSessionsLoading(false));
  }, [keyword, dateRange, directMode]);

  // Load journey directly when sessionId is provided
  useEffect(() => {
    if (!directMode || !sessionId) return;

    setJourneyLoading(true);
    setJourneyError('');

    fetch(`/api/journey/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setJourneyDetail(data);
      })
      .catch(err => setJourneyError(err.message || 'Failed to load journey'))
      .finally(() => setJourneyLoading(false));
  }, [sessionId, directMode]);

  const handleSelectSession = useCallback(async (sid: string) => {
    setView('timeline');
    setJourneyLoading(true);
    setJourneyError('');
    setJourneyDetail(null);

    try {
      const res  = await fetch(`/api/journey/${sid}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setJourneyDetail(data);
    } catch (err: any) {
      setJourneyError(err.message || 'Failed to load journey');
    } finally {
      setJourneyLoading(false);
    }
  }, []);

  const handleBack = () => {
    if (directMode) {
      onClose();
      return;
    }
    setView('sessions');
    setJourneyDetail(null);
    setJourneyError('');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200 shrink-0">
          {view === 'timeline' && (
            <button
              onClick={handleBack}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              aria-label="Back to sessions"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {view === 'sessions'
                ? `Sessions — "${keyword}"`
                : `Journey — "${keyword}"`}
            </h2>
            {view === 'sessions' && !sessionsLoading && (
              <p className="text-xs text-gray-500">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''} · click one to view journey
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {view === 'sessions' ? (
            <SessionsList
              keyword={keyword}
              sessions={sessions}
              isLoading={sessionsLoading}
              error={sessionsError}
              onSelectSession={handleSelectSession}
            />
          ) : (
            <TimelineView
              detail={journeyDetail}
              isLoading={journeyLoading}
              error={journeyError}
              domain={domain}
            />
          )}
        </div>
      </div>
    </>
  );
}
