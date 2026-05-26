'use client';
// =============================================================================
// AdLeak Shield — Admin Dashboard
// src/components/admin/AdminDashboard.tsx
//
// Three sections:
//   1. Global Metrics (users, MRR, waste)
//   2. User Management table (all tenants)
//   3. System Health (queue, SQL)
// =============================================================================

import React, { useState } from 'react';
import useSWR from 'swr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MetricsData {
  tenants: { total: number; active: number; trialing: number; inactive: number };
  mrr: number;
  waste30d: { total: number; tenantsWithData: number };
}

interface TenantRow {
  tenantId:            string;
  email:               string;
  subscriptionStatus:  string;
  trialEndsAt:         string | null;
  createdAt:           string | null;
  onboardingCompleted: boolean;
  sessions30d:         number;
  lastSessionAt:       string | null;
  waste30d:            number;
  campaignCount:       number;
}

interface HealthData {
  queue: { depth: number; queueName: string; error?: string };
  sql:   { avgCpuPercent: number | null; maxCpuPercent: number | null; sampleCount: number; error?: string };
  checkedAt: string;
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AdminDashboard() {
  const [search,    setSearch]    = useState('');
  const [extending, setExtending] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(7);

  const { data: metrics, isLoading: mLoading } =
    useSWR<MetricsData>('/api/admin/metrics', { refreshInterval: 60_000 });

  const { data: tenantsData, isLoading: tLoading, mutate: mutateTenants } =
    useSWR<{ tenants: TenantRow[]; count: number }>('/api/admin/tenants', { refreshInterval: 30_000 });

  const { data: health, isLoading: hLoading, mutate: mutateHealth } =
    useSWR<HealthData>('/api/admin/health', { refreshInterval: 30_000 });

  // ---- Filtered tenants
  const allTenants = tenantsData?.tenants ?? [];
  const tenants = search.trim()
    ? allTenants.filter(t =>
        t.email.toLowerCase().includes(search.toLowerCase()) ||
        t.subscriptionStatus.includes(search.toLowerCase())
      )
    : allTenants;

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
        alert(`❌ Error: ${d.error}`);
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
        // Navigate to dashboard as that user
        window.location.href = '/dashboard';
      } else {
        alert(`❌ Error: ${d.error}`);
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
        <p className="text-gray-400 text-sm mt-1">
          Platform overview — visible to you only
        </p>
      </div>

      {/* ====================================================================
          1. GLOBAL METRICS
      ==================================================================== */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Platform Metrics
        </h2>
        {mLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-xl h-24 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Total Users"    value={String(metrics?.tenants.total ?? 0)} sub={`${metrics?.tenants.active ?? 0} active · ${metrics?.tenants.trialing ?? 0} trial`} />
            <MetricCard label="MRR"            value={`£${fmt(metrics?.mrr ?? 0)}`}         sub="from Stripe active subs" />
            <MetricCard label="Waste (30d)"    value={`£${fmt(metrics?.waste30d.total ?? 0)}`} sub={`across ${metrics?.waste30d.tenantsWithData ?? 0} tenants`} color="red" />
            <MetricCard label="Inactive"       value={String(metrics?.tenants.inactive ?? 0)} sub="canceled / no sub" color="gray" />
          </div>
        )}
      </section>

      {/* ====================================================================
          2. USER MANAGEMENT
      ==================================================================== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Users ({tenantsData?.count ?? 0})
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by email or status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 text-gray-200 text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-gray-500 w-64"
            />
            <div className="flex items-center gap-1 text-xs text-gray-500">
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

        <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
          {tLoading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
          ) : tenants.length === 0 ? (
            <div className="p-8 text-center text-gray-600 text-sm">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Sessions 30d</th>
                    <th className="px-4 py-3 text-right">Waste 30d</th>
                    <th className="px-4 py-3 text-right">Campaigns</th>
                    <th className="px-4 py-3 text-left">Last Active</th>
                    <th className="px-4 py-3 text-left">Trial Ends</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t, i) => {
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
                            <span className="ml-2 text-xs text-yellow-600">(no onboarding)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(t.subscriptionStatus)}`}>
                            {t.subscriptionStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{t.sessions30d.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={t.waste30d > 0 ? 'text-red-400' : 'text-gray-500'}>
                            £{fmt(t.waste30d)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{t.campaignCount}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{timeSince(t.lastSessionAt)}</td>
                        <td className="px-4 py-3 text-xs">
                          {t.trialEndsAt ? (
                            <span className={dl !== null && dl <= 3 ? 'text-red-400' : 'text-gray-400'}>
                              {dl !== null && dl <= 0
                                ? 'Expired'
                                : dl !== null
                                  ? `${dl}d left`
                                  : '—'}
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
          )}
        </div>
      </section>

      {/* ====================================================================
          3. SYSTEM HEALTH
      ==================================================================== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
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
                    health?.queue?.depth === undefined || health.queue.depth === null
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
  label,
  value,
  sub,
  color = 'white',
}: {
  label: string;
  value: string;
  sub: string;
  color?: 'white' | 'red' | 'gray';
}) {
  const valueColor = color === 'red'
    ? 'text-red-400'
    : color === 'gray'
      ? 'text-gray-400'
      : 'text-white';

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-1">{sub}</p>
    </div>
  );
}
