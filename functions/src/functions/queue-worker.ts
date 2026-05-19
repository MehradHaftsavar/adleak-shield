// =============================================================================
// AdLeak Shield — Queue Worker Function
// functions/src/functions/queue-worker.ts
// =============================================================================

import {
  app,
  type InvocationContext,
} from "@azure/functions";
import mssql from "mssql";
import {
  QueueMessageSchema,
  type QueueMessage,
  type EventType,
} from "../lib/schemas.js";
import { withTenantDb, withAdminDb } from "../lib/db.js";

interface CampaignLookup {
  tenantId: string;
  campaignId: string;
  domainName: string;
  googleCampaignId: string;
}

async function lookupCampaign(
  googleCampaignId: string
): Promise<CampaignLookup | null> {
  return withAdminDb(async (request) => {
    const result = await request
      .input("googleCampaignId", mssql.NVarChar, googleCampaignId)
      .execute('sp_LookupCampaignForWorker');
    
    if (result.recordset.length === 0) return null;
    
    const row = result.recordset[0];
    return {
      tenantId: row.tenant_id,
      campaignId: row.campaign_id,
      domainName: row.domain_name,
      googleCampaignId: row.google_campaign_id,
    };
  });
}

async function logUnregistered(
  unrecognisedCampaignId: string,
  referringDomain: string,
  tenantId: string | null
): Promise<void> {
  await withAdminDb(async (request) => {
    request.input(
      "campaignId",
      mssql.NVarChar,
      unrecognisedCampaignId.substring(0, 20)
    );
    request.input(
      "referringDomain",
      mssql.NVarChar,
      referringDomain.substring(0, 253)
    );
    if (tenantId) {
      request.input("tenantId", mssql.UniqueIdentifier, tenantId);
      await request.query(
        `INSERT INTO UnregisteredTrafficLog
            (tenant_id, unrecognised_campaign_id, referring_domain)
         VALUES
            (@tenantId, @campaignId, @referringDomain)`
      );
    } else {
      await request.query(
        `INSERT INTO UnregisteredTrafficLog
            (unrecognised_campaign_id, referring_domain)
         VALUES
            (@campaignId, @referringDomain)`
      );
    }
  });
}

async function ensureSession(
  tx: mssql.Transaction,
  msg: QueueMessage,
  tenantId: string,
  campaignId: string,
  googleCampaignId: string
): Promise<string | null> {
  const env = msg.envelope;
  const sessionFingerprint =
    env.payload.sessionFingerprint ?? env.payload.session?.sessionFingerprint;
  if (!sessionFingerprint) return null;

  const findResult = await new mssql.Request(tx)
    .input("fpFind", mssql.NVarChar, sessionFingerprint.substring(0, 64))
    .query(
      `SELECT TOP 1 session_id FROM Sessions
       WHERE session_fingerprint = @fpFind`
    );

  if (findResult.recordset.length > 0) {
    return findResult.recordset[0].session_id;
  }

  if (env.eventType !== "session_start") return null;
  const session = env.payload.session;
  if (!session) return null;

  const created = await new mssql.Request(tx)
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .input("campaignId", mssql.UniqueIdentifier, campaignId)
    .input("fp", mssql.NVarChar, sessionFingerprint.substring(0, 64))
    .input("keyword", mssql.NVarChar, session.keyword ?? null)
    .input("matchType", mssql.NVarChar, session.matchType ?? null)
    .input("device", mssql.NVarChar, session.device ?? null)
    .input("gclid", mssql.NVarChar, session.gclid ?? null)
    .input("ipMasked", mssql.NVarChar, msg.ipMasked.substring(0, 20))
    .query(
      `INSERT INTO Sessions
          (tenant_id, campaign_id, session_fingerprint, keyword, match_type,
           device, gclid, ip_masked)
       OUTPUT INSERTED.session_id
       VALUES
          (@tenantId, @campaignId, @fp, @keyword, @matchType, @device,
           @gclid, @ipMasked)`
    );
  
  const sessionId = created.recordset[0]?.session_id ?? null;
  
  // Auto-cleanup: Delete old unregistered traffic logs for this campaign
  // This handles the case where user tested multiple times and earlier tests failed
  if (sessionId && googleCampaignId) {
    try {
      await new mssql.Request(tx)
        .input("gCampaignId", mssql.NVarChar, googleCampaignId.substring(0, 20))
        .query(
          `DELETE FROM UnregisteredTrafficLog
           WHERE unrecognised_campaign_id = @gCampaignId`
        );
    } catch (err) {
      // Don't fail session creation if cleanup fails - just log it
      console.warn('[ensureSession] Failed to cleanup old unregistered logs', err);
    }
  }
  
  return sessionId;
}

async function insertClickLog(
  tx: mssql.Transaction,
  msg: QueueMessage,
  tenantId: string,
  sessionId: string,
  campaignId: string
): Promise<void> {
  const env = msg.envelope;
  const session = env.payload.session;

  await new mssql.Request(tx)
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("campaignId", mssql.UniqueIdentifier, campaignId)
    .input("keyword", mssql.NVarChar, session?.keyword ?? null)
    .input("matchType", mssql.NVarChar, session?.matchType ?? null)
    .input(
      "landingPath",
      mssql.NVarChar,
      env.payload.pagePath ?? session?.landingPath ?? null
    )
    .query(
      `INSERT INTO ClickLogs
          (tenant_id, session_id, campaign_id, keyword, match_type,
           landing_page_path)
       VALUES
          (@tenantId, @sessionId, @campaignId, @keyword, @matchType,
           @landingPath)`
    );
}

async function insertJourneyEvent(
  tx: mssql.Transaction,
  msg: QueueMessage,
  tenantId: string,
  sessionId: string,
  eventType: EventType
): Promise<void> {
  const env = msg.envelope;
  const dbEventType =
    eventType === "session_start" || eventType === "pageview"
      ? "pageview"
      : eventType === "page_end"
      ? "heartbeat"
      : eventType;

  await new mssql.Request(tx)
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("eventType", mssql.NVarChar, dbEventType)
    .input("pagePath", mssql.NVarChar, env.payload.pagePath ?? null)
    .input("elementTag", mssql.NVarChar, env.payload.elementTag ?? null)
    .input("elementHref", mssql.NVarChar, env.payload.elementHref ?? null)
    .input("scrollPct", mssql.TinyInt, env.payload.scrollPct ?? null)
    .input("dwellMs", mssql.Int, env.payload.dwellMs ?? null)
    .query(
      `INSERT INTO JourneyEvents
          (tenant_id, session_id, event_type, page_path, element_tag,
           element_href, scroll_depth_pct, dwell_time_ms)
       VALUES
          (@tenantId, @sessionId, @eventType, @pagePath, @elementTag,
           @elementHref, @scrollPct, @dwellMs)`
    );
}

async function updateSessionDwell(
  tx: mssql.Transaction,
  sessionId: string,
  dwellMs: number
): Promise<void> {
  await new mssql.Request(tx)
    .input("sessionId", mssql.UniqueIdentifier, sessionId)
    .input("dwellMs", mssql.Int, Math.min(dwellMs, 86_400_000))
    .input("isBounce", mssql.Bit, dwellMs < 5000 ? 1 : 0)
    .query(
      `UPDATE Sessions
         SET total_duration_ms = @dwellMs,
             is_bounce = @isBounce
       WHERE session_id = @sessionId`
    );
}

export async function queueWorkerHandler(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const validation = QueueMessageSchema.safeParse(queueItem);
  if (!validation.success) {
    context.error("[Worker] Invalid queue message — discarding", {
      issues: validation.error.issues.length,
    });
    return;
  }

  const msg = validation.data;
  const env = msg.envelope;
  const googleCampaignId = env.payload.session?.campaignId ?? "";

  if (!googleCampaignId && env.eventType === "session_start") {
    context.log("[Worker] No campaign ID in session_start — discarding", {
      domain: env.domain,
    });
    return;
  }

  let campaign: CampaignLookup | null = null;

  if (googleCampaignId) {
    campaign = await lookupCampaign(googleCampaignId);
    if (!campaign) {
      context.log("[Worker] Unregistered campaign — logging", {
        campaignId: googleCampaignId,
        domain: env.domain,
      });
      try {
        await logUnregistered(googleCampaignId, env.domain, null);
      } catch (err) {
        context.error("[Worker] Failed to log unregistered traffic", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (env.domain.toLowerCase() !== campaign.domainName.toLowerCase()) {
      context.log("[Worker] Domain mismatch — logging", {
        campaignId: googleCampaignId,
        sentDomain: env.domain,
        registeredDomain: campaign.domainName,
      });
      try {
        await logUnregistered(googleCampaignId, env.domain, campaign.tenantId);
      } catch (err) {
        context.error("[Worker] Failed to log domain mismatch", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }

  if (!campaign) {
    const fp =
      env.payload.sessionFingerprint ??
      env.payload.session?.sessionFingerprint;
    if (!fp) return;

    const sessionInfo = await withAdminDb(async (request) => {
      const result = await request
        .input("fp", mssql.NVarChar, fp.substring(0, 64))
        .query(
          `SELECT TOP 1 tenant_id, campaign_id
           FROM Sessions WHERE session_fingerprint = @fp`
        );
      return result.recordset[0] ?? null;
    });

    if (!sessionInfo) {
      context.log("[Worker] Orphan event — no matching session", {
        eventType: env.eventType,
      });
      return;
    }

    campaign = {
      tenantId: sessionInfo.tenant_id,
      campaignId: sessionInfo.campaign_id,
      domainName: env.domain,
      googleCampaignId: googleCampaignId,
    };
  }

  try {
    await withTenantDb(campaign.tenantId, async (tx) => {
      const sessionId = await ensureSession(
        tx,
        msg,
        campaign!.tenantId,
        campaign!.campaignId,
        campaign!.googleCampaignId
      );
      if (!sessionId) {
        if (env.eventType === "session_start") {
          context.log("[Worker] Could not create session — missing payload, skipping");
          return;
        }
        // Race condition: session_start hasn't committed yet. Throw so Azure
        // Functions retries this message after the visibility timeout (~30s),
        // by which time session_start will be committed.
        throw new Error(`[Worker] Session not found for ${env.eventType} — will retry`);
      }

      switch (env.eventType) {
        case "session_start":
          await insertClickLog(
            tx,
            msg,
            campaign!.tenantId,
            sessionId,
            campaign!.campaignId
          );
          await insertJourneyEvent(
            tx,
            msg,
            campaign!.tenantId,
            sessionId,
            "session_start"
          );
          await new mssql.Request(tx)
            .input("campaignId", mssql.UniqueIdentifier, campaign!.campaignId)
            .query(
              `UPDATE Campaigns SET status = 'active'
               WHERE campaign_id = @campaignId
                 AND status = 'awaiting_data'`
            );
          break;
        case "pageview":
        case "click":
        case "success_event":
        case "heartbeat":
          await insertJourneyEvent(
            tx,
            msg,
            campaign!.tenantId,
            sessionId,
            env.eventType
          );
          if (env.eventType === "heartbeat" && env.payload.dwellMs) {
            await updateSessionDwell(tx, sessionId, env.payload.dwellMs);
          }
          break;
        case "page_end":
          if (env.payload.dwellMs) {
            await updateSessionDwell(tx, sessionId, env.payload.dwellMs);
          }
          break;
      }
    });
  } catch (err) {
    context.error("[Worker] DB write failed — will retry", {
      err: err instanceof Error ? err.message : String(err),
      eventType: env.eventType,
    });
    throw err;
  }
}

app.storageQueue("queue-worker", {
  queueName: process.env.QUEUE_NAME ?? "clicklog-ingest",
  connection: "QUEUE_CONNECTION",
  handler: queueWorkerHandler,
});