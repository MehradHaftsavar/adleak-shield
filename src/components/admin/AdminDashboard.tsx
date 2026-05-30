'use client';
// =============================================================================
// AdLeak Shield — Admin Dashboard
// src/components/admin/AdminDashboard.tsx
//
// Three sections:
//   1. Date range picker (Last 7d / 14d / 30d / custom)
//   2. Global Metrics (users, MRR, waste for selected range)
//   3. User Management table
//   4. System Health
// =============================================================================

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MetricsData {
  tenants:   { total: number; active: number; trialing: number; inactive: number };
  mrr:       number;
  waste:     { total: number; tenantsWithData: number };
  dateRange: { start: string; end: string };
}

interface TenantRow {
  tenantId:            string;
  email:               string;
  subscriptionStatus:  string;
  trialEndsAt:         string | null;
  createdAt:           string | null;
  onboardingCompleted: boolean;
  sessionsInRange:     number;
  lastSessionAt:       string | null;
  waste:               number;
  campaignCount:       number;
}

interface TenantsData {
  tenants:   TenantRow[];
  count:     number;
  dateRange: { start: string; end: string };
}

interface LastPurge {
  ranAt:                string;
  deletedSessions:      number;
  deletedJourneyEvents: number;
  deletedClickLogs:     number;
  retentionDays:        number;
  status:               string;
  errorMessage:         string | null;
}

interface HealthData {
  queue:     { depth: number; queueName: string; error?: string };
  sql:       { avgCpuPercent: number | null; maxCpuPercent: number | null; sampleCount: number; error?: string };
  lastPurge: LastPurge | null;
  checkedAt: string;
}

type Preset = '7d' | '14d' | '30d' | 'custom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeSince(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:   'bg-green-900 text-green-300',
    trialing: 'bg-blue-900 text-blue-300',
    canceled: 'bg-red-900 text-red-300',
    none:     'bg-gray-800 text-gray-400',
  };
  return map[status] ?? map.none;
}

function daysLeft(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function toDateInput(iso: string) {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

function presetRange(preset: Preset, customStart: string, customEnd: string) {
  const now = new Date();
  const endISO = now.toISOString();
  if (preset === '7d')     return { start: new Date(now.getTime() - 7  * 86400_000).toISOString(), end: endISO };
  if (preset === '14d')    return { start: new Date(now.getTime() - 14 * 86400_000).toISOString(), end: endISO };
  if (preset === '30d')    return { start: new Date(now.getTime() - 30 * 86400_000).toISOString(), end: endISO };
  // custom
  const s = customStart ? new Date(customStart).toISOString() : new Date(now.getTime() - 30 * 86400_000).toISOString();
  const e = customEnd   ? new Date(new Date(customEnd).setHours(23, 59, 59, 999)).toISOString() : endISO;
  return { start: s, end: e };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AdminDashboard() {
  // Date range state
  const [preset,      setPreset]      = useState<Preset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  // User table state
  const [search,        setSearch]        = useState('');
  const [extending,     setExtending]     = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [extendDays,    setExtendDays]    = useState(7);
  const [refreshing,    setRefreshing]    = useState(false);

  // Pagination
  const USER_PAGE_SIZE = 10;
  const [userPage, setUserPage] = useState(1);

  // Build query params from current date range
  const { start, end } = useMemo(
    () => presetRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );
  const qs = `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

  const { data: metrics, isLoading: mLoading, mutate: mutateMetrics } =
    useSWR<MetricsData>(`/api/admin/metrics${qs}`, { revalidateOnFocus: false });

  const { data: tenantsData, isLoading: tLoading, mutate: mutateTenants } =
    useSWR<TenantsData>(`/api/admin/tenants${qs}`, { revalidateOnFocus: false });

  const { data: health, isLoading: hLoading, mutate: mutateHealth } =
    useSWR<HealthData>('/api/admin/health', { refreshInterval: 60_000 });

  // Filter tenants by search
  const allTenants = tenantsData?.tenants ?? [];
  const tenants = search.trim()
    ? allTenants.filter(t =>
        t.email.toLowerCase().includes(search.toLowerCase()) ||
        t.subscriptionStatus.includes(search.toLowerCase())
      )
    : allTenants;

  // Reset to page 1 when search changes
  React.useEffect(() => { setUserPage(1); }, [search]);

  const userTotalPages = Math.max(1, Math.ceil(tenants.length / USER_PAGE_SIZE));
  const pageUsers = tenants.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);

  // ---- Extend trial
  async function extendTrial(tenantId: string) {
    setExtending(tenantId);
    try {
      const r = await fetch(`/api/admin/tenants/${tenantId}/extend-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: extendDays }),
      });
      const d = await r.json();
      if (r.ok) {
        alert(`✅ Trial extended to ${new Date(d.newTrialEndsAt).toLocaleDateString('en-GB')}`);
        mutateTenants();
      } else {
        alert(`❌ ${d.error}`);
      }
    } finally {
      setExtending(null);
    }
  }

  // ---- Start impersonation
  async function startImpersonation(tenantId: string, email: string) {
    if (!confirm(`View as ${email}?\n\nThis is READ-ONLY. All writes will be blocked.`)) return;
    setImpersonating(tenantId);
    try {
      const r = await fetch(`/api/admin/tenants/${tenantId}/impersonate`, { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        window.location.href = '/dashboard';
      } else {
        alert(`❌ ${d.error}`);
      }
    } finally {
      setImpersonating(null);
    }
  }

  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-8">
      {/* ====================================================================
          PAGE HEADER
      ==================================================================== */}
      <div>
        <h1 className="text-2xl font-bold text-white">Owner Admin Panel</h1>
        <p className="text-gray-400 text-sm mt-1">Platform overview — visible to you only</p>
      </div>

      {/* ====================================================================
          DATE RANGE PICKER
      ==================================================================== */}
      <div className="flex flex-wrap items-center gap-2">
        {(['7d', '14d', '30d'] as Preset[]).map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              preset === p
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Last {p}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            preset === 'custom'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Custom
        </button>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              max={customEnd || toDateInput(new Date().toISOString())}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-gray-800 text-gray-200 text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-500 text-sm">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={toDateInput(new Date().toISOString())}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-gray-800 text-gray-200 text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        <button
          onClick={async () => {
            setRefreshing(true);
            await Promise.all([mutateMetrics(), mutateTenants()]);
            setRefreshing(false);
          }}
          disabled={refreshing}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh all'}
        </button>
      </div>

      {/* ====================================================================
          1. GLOBAL METRICS
      ==================================================================== */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Platform Metrics
        </h2>
        {mLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-xl h-24 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 transition-opacity duration-300 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
            <MetricCard
              label="Total Users"
              value={String(metrics?.tenants?.total ?? 0)}
              sub={`${metrics?.tenants?.active ?? 0} active · ${metrics?.tenants?.trialing ?? 0} trial`}
            />
            <MetricCard
              label="MRR"
              value={`£${fmt(metrics?.mrr ?? 0)}`}
              sub="Stripe active subs"
            />
            <MetricCard
              label="Waste (selected period)"
              value={`£${fmt(metrics?.waste?.total ?? 0)}`}
              sub={`across ${metrics?.waste?.tenantsWithData ?? 0} tenants`}
              color="red"
            />
            <MetricCard
              label="Inactive"
              value={String(metrics?.tenants?.inactive ?? 0)}
              sub="canceled / no sub"
              color="gray"
            />
          </div>
        )}
      </section>

      {/* ====================================================================
          2. USER MANAGEMENT
      ==================================================================== */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Users ({tenantsData?.count ?? 0})
            {tLoading && <span className="ml-2 text-gray-600">loading…</span>}
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search by email or status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 text-gray-200 text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-gray-500 w-56"
            />
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              Extend by
              <input
                type="number"
                min={1}
                max={365}
                value={extendDays}
                onChange={e => setExtendDays(Number(e.target.value))}
                className="bg-gray-800 text-gray-200 w-14 text-center px-2 py-1 rounded border border-gray-700"
              />
              days
            </div>
          </div>
        </div>

        <div className={`bg-gray-900 rounded-xl overflow-hidden border border-gray-800 transition-opacity duration-300 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
          {tLoading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
          ) : tenants.length === 0 ? (
            <div className="p-8 text-center text-gray-600 text-sm">No users found</div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Sessions</th>
                    <th className="px-4 py-3 text-right">Waste</th>
                    <th className="px-4 py-3 text-right">Campaigns</th>
                    <th className="px-4 py-3 text-left">Last Active</th>
                    <th className="px-4 py-3 text-left">Trial Ends</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageUsers.map((t, i) => {
                    const dl = daysLeft(t.trialEndsAt);
                    return (
                      <tr
                        key={t.tenantId}
                        className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${
                          i % 2 === 0 ? '' : 'bg-gray-900/50'
                        }`}
                      >
                        <td className="px-4 py-3 text-gray-200 font-medium">
                          {t.email}
                          {!t.onboardingCompleted && (
                            <span className="ml-2 text-xs text-yellow-700">(no onboarding)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(t.subscriptionStatus)}`}>
                            {t.subscriptionStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {t.sessionsInRange.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={t.waste > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
                            £{fmt(t.waste)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{t.campaignCount}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{timeSince(t.lastSessionAt)}</td>
                        <td className="px-4 py-3 text-xs">
                          {t.subscriptionStatus === 'active' ? (
                            <span className="text-gray-600">—</span>
                          ) : t.trialEndsAt ? (
                            <span className={dl !== null && dl <= 3 ? 'text-red-400' : 'text-gray-400'}>
                              {dl === 0 ? 'Expired' : dl !== null ? `${dl}d left` : '—'}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => extendTrial(t.tenantId)}
                              disabled={extending === t.tenantId}
                              className="text-xs bg-blue-900/40 text-blue-300 px-2 py-1 rounded hover:bg-blue-800/50 transition-colors disabled:opacity-50"
                              title={`Extend trial by ${extendDays} days`}
                            >
                              {extending === t.tenantId ? '…' : `+${extendDays}d`}
                            </button>
                            <button
                              onClick={() => startImpersonation(t.tenantId, t.email)}
                              disabled={impersonating === t.tenantId}
                              className="text-xs bg-amber-900/40 text-amber-300 px-2 py-1 rounded hover:bg-amber-800/50 transition-colors disabled:opacity-50"
                              title="View dashboard as this user (read-only)"
                            >
                              {impersonating === t.tenantId ? '…' : 'View as'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {tenants.length > USER_PAGE_SIZE && (
              <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between gap-4">
                <p className="text-xs text-gray-500">
                  Showing {(userPage - 1) * USER_PAGE_SIZE + 1}–{Math.min(userPage * USER_PAGE_SIZE, tenants.length)} of {tenants.length} user{tenants.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    disabled={userPage === 1}
                    className="px-3 py-1 text-xs font-medium border border-gray-700 rounded-lg text-gray-400 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-500 font-medium px-1">
                    Page {userPage} of {userTotalPages}
                  </span>
                  <button
                    onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))}
                    disabled={userPage === userTotalPages}
                    className="px-3 py-1 text-xs font-medium border border-gray-700 rounded-lg text-gray-400 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </section>

      {/* ====================================================================
          3. SYSTEM HEALTH
      ==================================================================== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            System Health
          </h2>
          <button
            onClick={() => mutateHealth()}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {hLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-xl h-28 animate-pulse" />
            <div className="bg-gray-900 rounded-xl h-28 animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Queue */}
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Queue Depth</p>
                  <p className={`text-3xl font-bold ${
                    health?.queue?.depth == null
                      ? 'text-gray-600'
                      : health.queue.depth > 1000
                        ? 'text-red-400'
                        : health.queue.depth > 100
                          ? 'text-yellow-400'
                          : 'text-green-400'
                  }`}>
                    {health?.queue?.error
                      ? '—'
                      : health?.queue?.depth === -1
                        ? 'N/A'
                        : (health?.queue?.depth ?? '—').toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {health?.queue?.error
                      ? `Error: ${health.queue.error}`
                      : `Queue: ${health?.queue?.queueName ?? '—'}`}
                  </p>
                </div>
                <span className="text-2xl">📬</span>
              </div>
            </div>

            {/* SQL CPU */}
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">SQL CPU (5 min avg)</p>
                  <p className={`text-3xl font-bold ${
                    health?.sql?.avgCpuPercent == null
                      ? 'text-gray-600'
                      : health.sql.avgCpuPercent > 80
                        ? 'text-red-400'
                        : health.sql.avgCpuPercent > 50
                          ? 'text-yellow-400'
                          : 'text-green-400'
                  }`}>
                    {health?.sql?.avgCpuPercent != null
                      ? `${health.sql.avgCpuPercent}%`
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {health?.sql?.error
                      ? `Error: ${health.sql.error}`
                      : health?.sql?.maxCpuPercent != null
                        ? `Peak: ${health.sql.maxCpuPercent}% · ${health.sql.sampleCount} samples`
                        : 'Not available locally'}
                  </p>
                </div>
                <span className="text-2xl">🗄</span>
              </div>
            </div>

            {/* GDPR Janitor — last purge */}
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 sm:col-span-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                    GDPR Janitor — last purge
                  </p>
                  {health?.lastPurge == null ? (
                    <p className="text-gray-600 text-sm mt-1">
                      No runs yet — SQL migration may not have run
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`inline-flex items-center gap-1 text-sm font-semibold ${
                          health.lastPurge.status === 'success' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {health.lastPurge.status === 'success' ? '✓' : '✗'} {health.lastPurge.status}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {timeSince(health.lastPurge.ranAt)} · {new Date(health.lastPurge.ranAt).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      {health.lastPurge.status === 'error' && health.lastPurge.errorMessage && (
                        <p className="text-red-500 text-xs mt-1 font-mono">{health.lastPurge.errorMessage}</p>
                      )}
                      {health.lastPurge.status === 'success' && (
                        <div className="flex gap-4 mt-2 text-xs text-gray-400">
                          <span>{health.lastPurge.deletedSessions.toLocaleString()} sessions</span>
                          <span>{health.lastPurge.deletedJourneyEvents.toLocaleString()} events</span>
                          <span>{health.lastPurge.deletedClickLogs.toLocaleString()} click logs</span>
                          <span className="text-gray-600">({health.lastPurge.retentionDays}d retention)</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <span className="text-2xl">🧹</span>
              </div>
            </div>
          </div>
        )}

        {health?.checkedAt && (
          <p className="text-xs text-gray-700 mt-2 text-right">
            Last checked: {new Date(health.checkedAt).toLocaleTimeString('en-GB')}
          </p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------
function MetricCard({
  label, value, sub, color = 'white',
}: {
  label: string; value: string; sub: string; color?: 'white' | 'red' | 'gray';
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${
        color === 'red' ? 'text-red-400' : color === 'gray' ? 'text-gray-400' : 'text-white'
      }`}>
        {value}
      </p>
      <p className="text-xs text-gray-600 mt-1">{sub}</p>
    </div>
  );
}
