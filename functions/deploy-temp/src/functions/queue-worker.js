// =============================================================================
// AdLeak Shield — Queue Worker Function
// functions/src/functions/queue-worker.ts
// =============================================================================
import { app, } from "@azure/functions";
import mssql from "mssql";
import { QueueMessageSchema, } from "../lib/schemas.js";
import { withTenantDb, withAdminDb } from "../lib/db.js";
async function lookupCampaign(googleCampaignId) {
    return withAdminDb(async (request) => {
        const result = await request
            .input("gid", mssql.NVarChar, googleCampaignId)
            .query(`SELECT TOP 1
            c.tenant_id   AS tenantId,
            c.campaign_id AS campaignId,
            d.domain_name AS domainName
         FROM Campaigns c
         INNER JOIN Domains d ON d.domain_id = c.domain_id
         WHERE c.google_campaign_id = @gid`);
        if (result.recordset.length === 0)
            return null;
        return result.recordset[0];
    });
}
async function logUnregistered(unrecognisedCampaignId, referringDomain, tenantId) {
    await withAdminDb(async (request) => {
        request.input("campaignId", mssql.NVarChar, unrecognisedCampaignId.substring(0, 20));
        request.input("referringDomain", mssql.NVarChar, referringDomain.substring(0, 253));
        if (tenantId) {
            request.input("tenantId", mssql.UniqueIdentifier, tenantId);
            await request.query(`INSERT INTO UnregisteredTrafficLog
            (tenant_id, unrecognised_campaign_id, referring_domain)
         VALUES
            (@tenantId, @campaignId, @referringDomain)`);
        }
        else {
            await request.query(`INSERT INTO UnregisteredTrafficLog
            (unrecognised_campaign_id, referring_domain)
         VALUES
            (@campaignId, @referringDomain)`);
        }
    });
}
async function ensureSession(tx, msg, tenantId, campaignId) {
    const env = msg.envelope;
    const sessionFingerprint = env.payload.sessionFingerprint ?? env.payload.session?.sessionFingerprint;
    if (!sessionFingerprint)
        return null;
    const findResult = await new mssql.Request(tx)
        .input("fpFind", mssql.NVarChar, sessionFingerprint.substring(0, 64))
        .query(`SELECT TOP 1 session_id FROM Sessions
       WHERE session_fingerprint = @fpFind`);
    if (findResult.recordset.length > 0) {
        return findResult.recordset[0].session_id;
    }
    if (env.eventType !== "session_start")
        return null;
    const session = env.payload.session;
    if (!session)
        return null;
    const created = await new mssql.Request(tx)
        .input("tenantId", mssql.UniqueIdentifier, tenantId)
        .input("campaignId", mssql.UniqueIdentifier, campaignId)
        .input("fp", mssql.NVarChar, sessionFingerprint.substring(0, 64))
        .input("keyword", mssql.NVarChar, session.keyword ?? null)
        .input("matchType", mssql.NVarChar, session.matchType ?? null)
        .input("device", mssql.NVarChar, session.device ?? null)
        .input("gclid", mssql.NVarChar, session.gclid ?? null)
        .input("ipMasked", mssql.NVarChar, msg.ipMasked.substring(0, 20))
        .query(`INSERT INTO Sessions
          (tenant_id, campaign_id, session_fingerprint, keyword, match_type,
           device, gclid, ip_masked)
       OUTPUT INSERTED.session_id
       VALUES
          (@tenantId, @campaignId, @fp, @keyword, @matchType, @device,
           @gclid, @ipMasked)`);
    return created.recordset[0]?.session_id ?? null;
}
async function insertClickLog(tx, msg, tenantId, sessionId, campaignId) {
    const env = msg.envelope;
    const session = env.payload.session;
    await new mssql.Request(tx)
        .input("tenantId", mssql.UniqueIdentifier, tenantId)
        .input("sessionId", mssql.UniqueIdentifier, sessionId)
        .input("campaignId", mssql.UniqueIdentifier, campaignId)
        .input("keyword", mssql.NVarChar, session?.keyword ?? null)
        .input("matchType", mssql.NVarChar, session?.matchType ?? null)
        .input("landingPath", mssql.NVarChar, env.payload.pagePath ?? session?.landingPath ?? null)
        .query(`INSERT INTO ClickLogs
          (tenant_id, session_id, campaign_id, keyword, match_type,
           landing_page_path)
       VALUES
          (@tenantId, @sessionId, @campaignId, @keyword, @matchType,
           @landingPath)`);
}
async function insertJourneyEvent(tx, msg, tenantId, sessionId, eventType) {
    const env = msg.envelope;
    const dbEventType = eventType === "session_start" || eventType === "pageview"
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
        .query(`INSERT INTO JourneyEvents
          (tenant_id, session_id, event_type, page_path, element_tag,
           element_href, scroll_depth_pct, dwell_time_ms)
       VALUES
          (@tenantId, @sessionId, @eventType, @pagePath, @elementTag,
           @elementHref, @scrollPct, @dwellMs)`);
}
async function updateSessionDwell(tx, sessionId, dwellMs) {
    await new mssql.Request(tx)
        .input("sessionId", mssql.UniqueIdentifier, sessionId)
        .input("dwellMs", mssql.Int, Math.min(dwellMs, 86_400_000))
        .input("isBounce", mssql.Bit, dwellMs < 5000 ? 1 : 0)
        .query(`UPDATE Sessions
         SET total_duration_ms = @dwellMs,
             is_bounce = @isBounce
       WHERE session_id = @sessionId`);
}
export async function queueWorkerHandler(queueItem, context) {
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
    let campaign = null;
    if (googleCampaignId) {
        campaign = await lookupCampaign(googleCampaignId);
        if (!campaign) {
            context.log("[Worker] Unregistered campaign — logging", {
                campaignId: googleCampaignId,
                domain: env.domain,
            });
            try {
                await logUnregistered(googleCampaignId, env.domain, null);
            }
            catch (err) {
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
            }
            catch (err) {
                context.error("[Worker] Failed to log domain mismatch", {
                    err: err instanceof Error ? err.message : String(err),
                });
            }
            return;
        }
    }
    if (!campaign) {
        const fp = env.payload.sessionFingerprint ??
            env.payload.session?.sessionFingerprint;
        if (!fp)
            return;
        const sessionInfo = await withAdminDb(async (request) => {
            const result = await request
                .input("fp", mssql.NVarChar, fp.substring(0, 64))
                .query(`SELECT TOP 1 tenant_id, campaign_id
           FROM Sessions WHERE session_fingerprint = @fp`);
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
        };
    }
    try {
        await withTenantDb(campaign.tenantId, async (tx) => {
            const sessionId = await ensureSession(tx, msg, campaign.tenantId, campaign.campaignId);
            if (!sessionId) {
                context.log("[Worker] Could not resolve session_id — skipping event");
                return;
            }
            switch (env.eventType) {
                case "session_start":
                    await insertClickLog(tx, msg, campaign.tenantId, sessionId, campaign.campaignId);
                    await insertJourneyEvent(tx, msg, campaign.tenantId, sessionId, "session_start");
                    break;
                case "pageview":
                case "click":
                case "success_event":
                case "heartbeat":
                    await insertJourneyEvent(tx, msg, campaign.tenantId, sessionId, env.eventType);
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
    }
    catch (err) {
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
//# sourceMappingURL=queue-worker.js.map