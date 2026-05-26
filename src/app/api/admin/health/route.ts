// =============================================================================
// AdLeak Shield — Admin: System Health
// src/app/api/admin/health/route.ts
//
// Returns four health signals:
//   1. Azure Queue depth — messages waiting to be processed
//   2. SQL resource usage — CPU% from sys.dm_db_resource_stats (last 5 min)
//   3. Last janitor purge — rows deleted + timestamp from JanitorLog
//
// Owner-only. Returns 404 for non-owners.
// =============================================================================

import { NextResponse } from 'next/server';
import { requireOwner, ownerNotFound } from '@/lib/adminAuth';
import { withAdminDb } from '@/lib/db/client';

export async function GET() {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  const [queueResult, sqlResult, purgeResult] = await Promise.allSettled([
    getQueueDepth(),
    getSqlHealth(),
    getLastPurge(),
  ]);

  const queue = queueResult.status === 'fulfilled'
    ? queueResult.value
    : { depth: null, error: String((queueResult as PromiseRejectedResult).reason) };

  const sql = sqlResult.status === 'fulfilled'
    ? sqlResult.value
    : { avgCpuPercent: null, maxCpuPercent: null, sampleCount: 0, error: String((sqlResult as PromiseRejectedResult).reason) };

  const lastPurge = purgeResult.status === 'fulfilled'
    ? purgeResult.value
    : null;

  return NextResponse.json({
    queue,
    sql,
    lastPurge,
    checkedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Queue depth via Azure Storage SDK
// ---------------------------------------------------------------------------
async function getQueueDepth(): Promise<{ depth: number; queueName: string }> {
  const connStr   = process.env.AZURE_QUEUE_CONNECTION_STRING;
  const queueName = process.env.QUEUE_NAME ?? 'clicklog-ingest';

  if (!connStr) {
    return { depth: -1, queueName: 'not-configured' };
  }

  const { QueueServiceClient } = await import('@azure/storage-queue');
  const client      = QueueServiceClient.fromConnectionString(connStr);
  const queueClient = client.getQueueClient(queueName);
  const props       = await queueClient.getProperties();

  return { depth: props.approximateMessagesCount ?? 0, queueName };
}

// ---------------------------------------------------------------------------
// SQL CPU from system view (Azure SQL only)
// ---------------------------------------------------------------------------
async function getSqlHealth(): Promise<{
  avgCpuPercent: number | null;
  maxCpuPercent: number | null;
  sampleCount:   number;
}> {
  try {
    const result = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT
          ROUND(AVG(avg_cpu_percent), 1) AS avg_cpu,
          ROUND(MAX(avg_cpu_percent), 1) AS max_cpu,
          COUNT(*)                        AS samples
        FROM sys.dm_db_resource_stats
        WHERE end_time >= DATEADD(minute, -5, GETUTCDATE())
      `);
      return r.recordset[0] ?? null;
    });

    return {
      avgCpuPercent: result?.avg_cpu  ?? null,
      maxCpuPercent: result?.max_cpu  ?? null,
      sampleCount:   result?.samples  ?? 0,
    };
  } catch {
    return { avgCpuPercent: null, maxCpuPercent: null, sampleCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Last janitor purge from JanitorLog
// Returns null if table doesn't exist yet (before SQL migration runs)
// ---------------------------------------------------------------------------
async function getLastPurge(): Promise<{
  ranAt:                string;
  deletedSessions:      number;
  deletedJourneyEvents: number;
  deletedClickLogs:     number;
  retentionDays:        number;
  status:               string;
  errorMessage:         string | null;
} | null> {
  try {
    const row = await withAdminDb(async (req) => {
      const r = await req.query(`
        SELECT TOP 1
          ran_at,
          deleted_sessions,
          deleted_journey_events,
          deleted_clicklogs,
          retention_days,
          status,
          error_message
        FROM JanitorLog
        ORDER BY ran_at DESC
      `);
      return r.recordset[0] ?? null;
    });

    if (!row) return null;

    return {
      ranAt:                new Date(row.ran_at).toISOString(),
      deletedSessions:      Number(row.deleted_sessions       ?? 0),
      deletedJourneyEvents: Number(row.deleted_journey_events ?? 0),
      deletedClickLogs:     Number(row.deleted_clicklogs      ?? 0),
      retentionDays:        Number(row.retention_days         ?? 90),
      status:               row.status        ?? 'unknown',
      errorMessage:         row.error_message ?? null,
    };
  } catch {
    // JanitorLog table doesn't exist yet — SQL migration hasn't run
    return null;
  }
}
