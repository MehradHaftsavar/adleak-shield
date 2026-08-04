// =============================================================================
// AdLeak Shield — Database Client (Functions side)
// functions/src/lib/db.ts
// =============================================================================


import mssql from "mssql";
import { ManagedIdentityCredential  } from "@azure/identity";

let pool: mssql.ConnectionPool | null = null;
// When the pool goes stale, up to batchSize (16) concurrent invocations can
// all discover it dead in the same instant. Without this, each one raced to
// build its own competing ConnectionPool and stomped on the shared `pool`
// variable — which is exactly what caused retries to fail with the same
// "Connection is closed" error. Caching the in-flight promise means only the
// first caller actually reconnects; everyone else just awaits that same
// attempt and shares its result.
let connecting: Promise<mssql.ConnectionPool> | null = null;

async function getToken(): Promise<string> {
  const credential = new ManagedIdentityCredential ();
  const tokenResponse = await credential.getToken(
    "https://database.windows.net/"
  );
  if (!tokenResponse?.token) {
    throw new Error("Failed to acquire managed identity token for SQL.");
  }
  return tokenResponse.token;
}

async function getPool(): Promise<mssql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  if (connecting) return connecting;

  connecting = connectPool();
  try {
    pool = await connecting;
    return pool;
  } finally {
    connecting = null;
  }
}

async function connectPool(): Promise<mssql.ConnectionPool> {
  const server = process.env.DATABASE_SERVER;
  const database = process.env.DATABASE_NAME;
  if (!server || !database) {
    throw new Error("DATABASE_SERVER and DATABASE_NAME must be set.");
  }

  const token = await getToken();
  const config: mssql.config = {
    server,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token },
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
    requestTimeout: 35_000,
    connectionTimeout: 35_000,
  };

  let attempts = 0;
  const maxAttempts = 6;
  const newPool = new mssql.ConnectionPool(config);

  while (attempts < maxAttempts) {
    try {
      await newPool.connect();
      return newPool;
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(
          `[DB] Connect failed after ${maxAttempts} attempts: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      await new Promise((r) => setTimeout(r, 6_000));
    }
  }
  throw new Error("Unreachable");
}

// pool.connected only reflects whether .connect() ever succeeded and .close()
// was never called — it does NOT detect a connection that Azure SQL or the
// network silently killed while idle. That surfaces as this specific error
// the moment a query is attempted on it. Distinguish it from real query/data
// errors so we only retry the connection-is-dead case.
function isDeadConnectionError(err: unknown): boolean {
  return (
    err instanceof mssql.ConnectionError ||
    (err instanceof Error && err.message.includes("Connection is closed"))
  );
}

/**
 * Run callback inside a transaction with TenantId set on session_context.
 * The callback receives the transaction itself.
 */
export async function withTenantDb<T>(
  tenantId: string,
  callback: (transaction: mssql.Transaction) => Promise<T>
): Promise<T> {
  try {
    return await runTenantDb(tenantId, callback);
  } catch (err) {
    if (isDeadConnectionError(err)) {
      pool = null;
      return await runTenantDb(tenantId, callback);
    }
    throw err;
  }
}

async function runTenantDb<T>(
  tenantId: string,
  callback: (transaction: mssql.Transaction) => Promise<T>
): Promise<T> {
  const p = await getPool();
  const transaction = new mssql.Transaction(p);
  await transaction.begin();

  try {
    const ctxRequest = new mssql.Request(transaction);
    await ctxRequest
      .input("tenantId", mssql.UniqueIdentifier, tenantId)
      .query(
        `DECLARE @tid VARBINARY(128) = CAST(CAST(@tenantId AS UNIQUEIDENTIFIER) AS VARBINARY(128));
         EXEC sp_set_session_context N'TenantId', @tid, @read_only = 0`
      );

    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Run callback without a tenant context — for cross-tenant lookups only.
 */
export async function withAdminDb<T>(
  callback: (request: mssql.Request) => Promise<T>
): Promise<T> {
  try {
    const p = await getPool();
    const request = new mssql.Request(p);
    return await callback(request);
  } catch (err) {
    if (isDeadConnectionError(err)) {
      pool = null;
      const p = await getPool();
      const request = new mssql.Request(p);
      return await callback(request);
    }
    throw err;
  }
}

// Export sql namespace for use in other files
//export { sql };
