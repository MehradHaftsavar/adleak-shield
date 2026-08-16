// =============================================================================
// AdLeak Shield — Pending Event Reconciler
// functions/src/functions/reconcile.ts
//
// Runs every 5 minutes.
//
// The worker parks any event it could not immediately attach to a session.
// Most of those are queue-ordering races rather than genuine mysteries: with
// batchSize 16 the worker processes messages concurrently, so page 2 can be
// handled before page 1 has committed. By the time this runs, everything has
// landed and the same match ladder succeeds.
//
// The guarantee this exists to provide: no event is ever discarded. Anything
// that still cannot be placed after 24 hours is marked permanently
// unattributed and kept — visible and countable — rather than deleted.
//
// status: 0 = pending, 1 = attached to a session, 2 = permanently unattributed
// =============================================================================

import { app, type InvocationContext } from "@azure/functions";
import mssql from "mssql";
import { withAdminDb } from "../lib/db.js";
import { QueueMessageSchema } from "../lib/schemas.js";
import { attachPendingEvent } from "./queue-worker.js";

const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

// Above this many unresolved rows, something is systematically failing to
// match rather than the usual handful of queue-ordering races. Logged as an
// error purely so an Application Insights alert can fire on it — there is no
// Azure metric for a row count in the database.
const BACKLOG_ALERT_THRESHOLD = 500;

interface PendingRow {
  id: string;
  payload_json: string;
  attempts: number;
  created_at: Date;
}

app.timer("reconcile", {
  schedule: "0 */5 * * * *",
  runOnStartup: false,

  handler: async (_timer: unknown, context: InvocationContext): Promise<void> => {
    let rows: PendingRow[];
    try {
      rows = await withAdminDb(async (req) => {
        const r = await req
          .input("batch", mssql.Int, BATCH_SIZE)
          .query(`
            SELECT TOP (@batch) id, payload_json, attempts, created_at
            FROM PendingEvents
            WHERE status = 0
            ORDER BY created_at ASC
          `);
        return r.recordset as PendingRow[];
      });
    } catch (err) {
      context.error("[Reconcile] Could not read pending events", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    if (rows.length === 0) return;

    let attached = 0;
    let abandoned = 0;

    for (const row of rows) {
      const age = Date.now() - new Date(row.created_at).getTime();

      try {
        const parsed = QueueMessageSchema.safeParse(JSON.parse(row.payload_json));
        if (!parsed.success) {
          // Unparseable payload can never be attached — stop retrying it, but
          // keep the row so the event is still accounted for.
          await markStatus(row.id, 2);
          abandoned++;
          continue;
        }

        const ok = await attachPendingEvent(parsed.data, context);
        if (ok) {
          await markStatus(row.id, 1);
          attached++;
        } else if (age > GIVE_UP_AFTER_MS) {
          await markStatus(row.id, 2);
          abandoned++;
        } else {
          await bumpAttempts(row.id);
        }
      } catch (err) {
        context.warn("[Reconcile] Attach failed, will retry", {
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
        if (age > GIVE_UP_AFTER_MS) {
          await markStatus(row.id, 2);
          abandoned++;
        } else {
          await bumpAttempts(row.id);
        }
      }
    }

    context.log(
      `[Reconcile] ${rows.length} pending · ${attached} attached · ${abandoned} unattributed`
    );

    // Separate count: the batch above is capped at BATCH_SIZE, so it cannot
    // reveal how deep the backlog actually is. Wrapped so a failure here can
    // never take down the reconciliation that just succeeded.
    try {
      const backlog = await withAdminDb(async (req) => {
        const r = await req.query(
          `SELECT COUNT(*) AS pending FROM PendingEvents WHERE status = 0`
        );
        return (r.recordset[0]?.pending as number) ?? 0;
      });

      if (backlog > BACKLOG_ALERT_THRESHOLD) {
        // context.error only raises the log level — it does not throw, so the
        // invocation still reports success and this stays out of the
        // failed-requests alert. It exists solely for an alert to match on.
        context.error(
          `[Reconcile] BACKLOG — ${backlog} events unresolved, exceeds threshold of ${BACKLOG_ALERT_THRESHOLD}`
        );
      }
    } catch (err) {
      context.warn("[Reconcile] Backlog count failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

async function markStatus(id: string, status: number): Promise<void> {
  await withAdminDb(async (req) => {
    await req
      .input("id", mssql.UniqueIdentifier, id)
      .input("status", mssql.TinyInt, status)
      .query(`UPDATE PendingEvents SET status = @status WHERE id = @id`);
  });
}

async function bumpAttempts(id: string): Promise<void> {
  await withAdminDb(async (req) => {
    await req
      .input("id", mssql.UniqueIdentifier, id)
      .query(`UPDATE PendingEvents SET attempts = attempts + 1 WHERE id = @id`);
  });
}
