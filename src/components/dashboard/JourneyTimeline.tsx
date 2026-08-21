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
import { INACTIVITY_WINDOW_MS } from '@/lib/sessionRules';

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
  hasInteraction:  boolean;
  maxScrollPct:    number | null;
  /** Last thing we heard, heartbeats included. Null on the sessions list. */
  endedAt?:        string | null;
  /** Time on the final page — the stretch the timeline has no step for. */
  lastPageMs?:     number | null;
}

interface JourneyEvent {
  eventId:        string;
  eventType:      'pageview' | 'click' | 'success_event' | 'form_interact' | 'tab_return';
  pagePath:       string | null;
  elementTag:     string | null;
  elementHref:    string | null;
  elementText:    string | null;
  scrollDepthPct: number | null;
  dwellTimeMs:    number | null;
  occurredAt:     string;
}

interface JourneyDetail {
  session: Omit<SessionSummary, 'eventCount'>;
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

/**
 * Converted / Bounce / No interaction / Engaged, in that order of precedence.
 *
 * "No interaction" is the new one: a visitor who stayed past the bounce
 * threshold but never clicked, typed or scrolled. Previously these showed as
 * Engaged, which flattered them — the page was merely open. Bounce keeps its
 * existing meaning (left almost immediately) because is_bounce is read by the
 * leaks report and the weekly email, and moving it would move a money figure.
 */
function OutcomeBadge({
  hasSuccessEvent, isBounce, hasInteraction, size = 'sm',
}: {
  hasSuccessEvent: boolean; isBounce: boolean; hasInteraction: boolean; size?: 'sm' | 'md';
}) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium';
  const icon = size === 'md' ? 'w-3 h-3' : 'w-3 h-3';

  if (hasSuccessEvent) {
    return (
      <span className={`${base} bg-green-100 text-green-800`}>
        <CheckCircle className={icon} />
        Converted
      </span>
    );
  }
  if (isBounce) {
    return (
      <span className={`${base} bg-red-100 text-red-800`}>
        <AlertCircle className={icon} />
        Bounce
      </span>
    );
  }
  if (!hasInteraction) {
    return (
      <span className={`${base} bg-amber-100 text-amber-800`} title="Stayed on the page but never clicked, typed or scrolled">
        <AlertCircle className={icon} />
        No interaction
      </span>
    );
  }
  return (
    <span className={`${base} bg-blue-100 text-blue-800`}>
      <CheckCircle className={icon} />
      Engaged
    </span>
  );
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
              <OutcomeBadge
                hasSuccessEvent={s.hasSuccessEvent}
                isBounce={s.isBounce}
                hasInteraction={s.hasInteraction}
              />

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
          <OutcomeBadge
            hasSuccessEvent={session.hasSuccessEvent}
            isBounce={session.isBounce}
            hasInteraction={session.hasInteraction}
            size="md"
          />
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
          {session.maxScrollPct != null && (
            <span className="text-xs text-gray-400">
              {session.maxScrollPct}% scrolled
            </span>
          )}
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
              {events.map((event, idx) =>
                event.eventType === 'tab_return'
                  ? <TabReturnRows key={event.eventId} event={event} />
                  : <TimelineEventRow key={event.eventId} event={event} index={idx} domain={domain} />
              )}
              <VisitEndedRow endedAt={session.endedAt} lastPageMs={session.lastPageMs} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Closing line on a finished visit.
 *
 * The timeline's last step is whatever the visitor last CLICKED, but they
 * usually carry on reading afterwards — three minutes on a contact page leaves
 * no step at all, so the header total looked inflated against the steps with no
 * way to tell why. This is that missing stretch, made visible.
 *
 * Hidden until the visit is genuinely over. Inside the inactivity window they
 * may still come back and add steps, and printing "ended" over a live visit
 * would be wrong. Timed from the last event of ANY kind, heartbeats included,
 * so it is accurate to the 15-second beat rather than to the last click.
 *
 * Deliberately "Visit ended" and not "Closed the tab": closing a tab, typing a
 * new address, returning to Google and the phone killing the page all look
 * identical from here, and this is a product people use as evidence.
 */
function VisitEndedRow({ endedAt, lastPageMs }: { endedAt?: string | null; lastPageMs?: number | null }) {
  if (!endedAt) return null;
  const endedMs = new Date(endedAt).getTime();
  if (!Number.isFinite(endedMs)) return null;
  if (Date.now() - endedMs < INACTIVITY_WINDOW_MS) return null;

  return (
    <div className="relative flex items-start gap-3 pl-6">
      <div className="absolute left-0 mt-1 w-3.5 h-3.5 rounded-full border-2 border-white shrink-0 ring-2 bg-gray-300 ring-gray-100" />
      <div className="flex-1 min-w-0 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
        <p className="text-sm font-medium text-gray-500">Visit ended</p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {/* "active" matters. This figure excludes time the tab was hidden,
              while the timestamp beside it is the last thing we heard — so a
              visitor who read for 1.4s, locked their phone and had the tab
              discarded 69s later shows "1s active" next to a time 71s after
              they arrived. Without the word the line reads as a contradiction.
              Explaining the gap itself needs the tab-return events (Item 4).

              Below a second there is nothing worth saying, so the ending shows
              on its own rather than "0s active on this page" — that guards
              against the leftover flush heartbeat, which reports 1–4ms after
              page_end has already banked the real total. */}
          {lastPageMs != null && lastPageMs >= 1000 && (
            <span className="text-xs text-gray-500">
              {formatDuration(lastPageMs)} active on this page
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">{formatTime(endedAt)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * One stored event, two steps on screen.
 *
 * The tracker only reports the RETURN, carrying how long the visitor was away
 * — a timer started in a hidden tab gets throttled or frozen by browsers, so
 * anything sent at the moment of leaving is unreliable. Subtracting awayMs from
 * the return timestamp reconstructs when they left, which is what makes the gap
 * in the timeline explain itself instead of looking like missing data.
 *
 * awayMs travels in dwell_time_ms — the same column heartbeats use for a very
 * different quantity, which is why this is keyed off the event type rather than
 * read blindly. That time is NOT part of the session duration and never should
 * be; the tracker stops its clock the moment a tab hides.
 */
function TabReturnRows({ event }: { event: JourneyEvent }) {
  const awayMs = event.dwellTimeMs ?? 0;
  const backAt = new Date(event.occurredAt);
  const leftAt = new Date(backAt.getTime() - awayMs);

  const dot = 'absolute left-0 mt-1 w-3.5 h-3.5 rounded-full border-2 border-white shrink-0 ring-2 bg-gray-300 ring-gray-100';
  const box = 'flex-1 min-w-0 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3';

  return (
    <>
      <div className="relative flex items-start gap-3 pl-6">
        <div className={dot} />
        <div className={box}>
          <p className="text-sm font-medium text-gray-500">Left the tab</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-400 ml-auto">{formatTime(leftAt.toISOString())}</span>
          </div>
        </div>
      </div>

      <div className="relative flex items-start gap-3 pl-6">
        <div className={dot} />
        <div className={box}>
          <p className="text-sm font-medium text-gray-500">Came back</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-gray-500">
              away {formatDuration(awayMs)} — not counted
            </span>
            <span className="text-xs text-gray-400 ml-auto">{formatTime(event.occurredAt)}</span>
          </div>
        </div>
      </div>
    </>
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
    label = event.elementText || 'Started filling out a form';
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
