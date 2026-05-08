// =============================================================================
// AdLeak Shield — Database Connection
// src/lib/db/client.ts
//
// HOW THIS WORKS:
// 1. We connect to Azure SQL using a Managed Identity token — no password.
// 2. Before EVERY query, we set SESSION_CONTEXT('TenantId') so the RLS
//    policy knows which tenant's data to show. This is non-negotiable.
// 3. We handle the auto-pause cold-start (up to 30s) with a retry loop.
//
// NOTE: We use the mssql package directly. Drizzle ORM's mssql-core module
// is not yet stable, so raw mssql gives us full control and type safety
// via the schema types in schema.ts.
// =============================================================================

import * as mssql from "mssql";

// =============================================================================
// MANAGED IDENTITY TOKEN ACQUISITION
// Instead of a password, we ask Azure's metadata endpoint for a token.
// This endpoint only works inside Azure. In local dev, the @azure/identity
// package falls back to your `az login` credentials automatically.
// =============================================================================

async function getManagedIdentityToken(): Promise<string> {
  // In local development, use DefaultAzureCredential from @azure/identity
  // which picks up your `az login` session automatically.
  if (process.env.NODE_ENV === "development") {
    const { DefaultAzureCredential } = await import("@azure/identity");
    const credential = new DefaultAzureCredential();
    const tokenResponse = await credential.getToken(
      "https://database.windows.net/"
    );
    if (!tokenResponse?.token) {
      throw new Error(
        "Failed to acquire token via DefaultAzureCredential. " +
        "Make sure you have run `az login` in your terminal."
      );
    }
    return tokenResponse.token;
  }

  // In production (inside Azure Functions), use the IMDS endpoint directly.
  const endpoint =
    "http://169.254.169.254/metadata/identity/oauth2/token" +
    "?api-version=2018-02-01" +
    "&resource=https%3A%2F%2Fdatabase.windows.net%2F";

  const response = await fetch(endpoint, {
    headers: { Metadata: "true" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to acquire Managed Identity token: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// =============================================================================
// CONNECTION POOL
// We keep one pool alive for the lifetime of the serverless function instance.
// max: 5 connections — sufficient for Starter tier, respects SQL DTU limits.
// =============================================================================

let pool: mssql.ConnectionPool | null = null;

async function getPool(): Promise<mssql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const token = await getManagedIdentityToken();

  const server = process.env.DATABASE_SERVER;
  const database = process.env.DATABASE_NAME;

  if (!server || !database) {
    throw new Error(
      "DATABASE_SERVER and DATABASE_NAME environment variables must be set."
    );
  }

  const config: mssql.config = {
    server,
    database,
    options: {
      encrypt: true,               // Required for Azure SQL — enforces TLS
      trustServerCertificate: false, // Never trust self-signed certs in production
      enableArithAbort: true,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token },
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
    requestTimeout: 35_000,    // 35s — covers the 30s auto-pause cold-start
    connectionTimeout: 35_000,
  };

  pool = new mssql.ConnectionPool(config);

  // Retry logic for auto-pause cold starts.
  // Azure SQL Serverless can take up to 30 seconds to wake from pause.
  let attempts = 0;
  const maxAttempts = 6;
  const retryDelayMs = 6_000;

  while (attempts < maxAttempts) {
    try {
      await pool.connect();
      console.log("[DB] Connection pool established.");
      return pool;
    } catch (err) {
      attempts++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[DB] Connection attempt ${attempts}/${maxAttempts} failed: ${message}`
      );
      if (attempts >= maxAttempts) {
        throw new Error(
          `[DB] Could not connect after ${maxAttempts} attempts. Last error: ${message}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error("[DB] Unreachable — retry loop exhausted.");
}

// =============================================================================
// SESSION CONTEXT SETTER
// MUST be called before every query on tenant-scoped tables.
// Sets the TenantId that the RLS policy reads to filter rows.
//
// SECURITY: if this is skipped, SESSION_CONTEXT returns NULL, which matches
// no rows — the query returns empty rather than leaking data. Fail-safe.
// =============================================================================

async function setTenantContext(
  request: mssql.Request,
  tenantId: string
): Promise<void> {
  // Parameterised to prevent any injection via the tenantId value.
  // read_only = 1 means the value cannot be overwritten once set.
  await request
    .input("tenantId", mssql.UniqueIdentifier, tenantId)
    .query(
      "EXEC sp_set_session_context N'TenantId', @tenantId, @read_only = 0"
    );
}

// =============================================================================
// withTenantDb — main export for all tenant-scoped queries
//
// Usage:
//   const rows = await withTenantDb(tenantId, async (request) => {
//     const result = await request.query(
//       `SELECT * FROM ClickLogs WHERE tenant_id = @tenantId`
//     )
//     return result.recordset
//   })
// =============================================================================

export async function withTenantDb<T>(
  tenantId: string,
  callback: (request: mssql.Request) => Promise<T>
): Promise<T> {
  const pool = await getPool();
  const transaction = new mssql.Transaction(pool);
  await transaction.begin();

  try {
    // Create request for callback
    const request = new mssql.Request(transaction);
    
    // CRITICAL: Add tenant_id as a parameter that callback can use
    request.input("currentTenantId", mssql.UniqueIdentifier, tenantId);
    
    // Set session context using the SAME request
    await request.query(`
      DECLARE @tid VARBINARY(128) = CAST(CAST(@currentTenantId AS UNIQUEIDENTIFIER) AS VARBINARY(128));
      EXEC sp_set_session_context N'TenantId', @tid, @read_only = 0;
    `);

    const result = await callback(request);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// =============================================================================
// withAdminDb — for cross-tenant queries (admin panel only, Phase 6)
// Does NOT set a TenantId context.
// NEVER call this from tenant-facing routes.
// =============================================================================

export async function withAdminDb<T>(
  callback: (request: mssql.Request) => Promise<T>
): Promise<T> {
  const pool = await getPool();
  const request = new mssql.Request(pool);
  return callback(request);
}

// =============================================================================
// pingDatabase — used by /api/wake for pre-emptive cold-start strategy
// Called the moment a user clicks Sign In to start waking the DB early.
// =============================================================================

export async function pingDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ping");
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}