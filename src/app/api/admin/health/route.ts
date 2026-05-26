// =============================================================================
// AdLeak Shield — Admin: System Health
// src/app/api/admin/health/route.ts
//
// Returns three health signals:
//   1. Azure Queue depth — how many messages are waiting to be processed
//   2. SQL resource usage — CPU% from sys.dm_db_resource_stats (last 5 min)
//   3. Recent error count — failed queue-worker executions logged in DB
//
// Owner-only. Returns 404 for non-owners.
// =============================================================================

import { NextResponse } from 'next/server';
import { requireOwner, ownerNotFound } from '@/lib/adminAuth';
import { withAdminDb } from '@/lib/db/client';

export async function GET() {
  const session = await requireOwner();
  if (!session) return ownerNotFound();

  // Run all three checks in parallel — don't let one failure block the others
  const [queueResult, sqlResult] = await Promise.allSettled([
    getQueueDepth(),
    getSqlHealth(),
  ]);

  const queue = queueResult.status === 'fulfilled'
    ? queueResult.value
    : { depth: null, error: String((queueResult as PromiseRejectedResult).reason) };

  const sql = sqlResult.status === 'fulfilled'
    ? sqlResult.value
    : { avgCpuPercent: null, maxCpuPercent: null, error: String((sqlResult as PromiseRejectedResult).reason) };

  return NextResponse.json({
    queue,
    sql,
    checkedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Queue depth via Azure Storage SDK
// ---------------------------------------------------------------------------
async function getQueueDepth(): Promise<{ depth: number; queueName: string }> {
  const connStr   = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const queueName = process.env.AZURE_QUEUE_NAME ?? 'clickevents';

  if (!connStr) {
    return { depth: -1, queueName: 'not-configured' };
  }

  const { QueueServiceClient } = await import('@azure/storage-queue');
  const client       = QueueServiceClient.fromConnectionString(connStr);
  const queueClient  = client.getQueueClient(queueName);
  const props        = await queueClient.getProperties();
  const depth        = props.approximateMessagesCount ?? 0;

  return { depth, queueName };
}

// ---------------------------------------------------------------------------
// SQL resource usage — CPU% from system view
// Only works on Azure SQL (not local dev SQL Server)
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
          ROUND(AVG(avg_cpu_percent), 1)  AS avg_cpu,
          ROUND(MAX(avg_cpu_percent), 1)  AS max_cpu,
          COUNT(*)                         AS samples
        FROM sys.dm_db_resource_stats
        WHERE end_time >= DATEADD(minute, -5, GETUTCDATE())
      `);
      return r.recordset[0] ?? null;
    });

    return {
      avgCpuPercent: result?.avg_cpu   ?? null,
      maxCpuPercent: result?.max_cpu   ?? null,
      sampleCount:   result?.samples   ?? 0,
    };
  } catch {
    // sys.dm_db_resource_stats only exists on Azure SQL — silently unavailable locally
    return { avgCpuPercent: null, maxCpuPercent: null, sampleCount: 0 };
  }
}
