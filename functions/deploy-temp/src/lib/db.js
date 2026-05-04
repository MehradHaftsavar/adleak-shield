// =============================================================================
// AdLeak Shield — Database Client (Functions side)
// functions/src/lib/db.ts
// =============================================================================
import mssql, * as sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";
let pool = null;
async function getToken() {
    const credential = new DefaultAzureCredential();
    const tokenResponse = await credential.getToken("https://database.windows.net/");
    if (!tokenResponse?.token) {
        throw new Error("Failed to acquire managed identity token for SQL.");
    }
    return tokenResponse.token;
}
async function getPool() {
    if (pool && pool.connected)
        return pool;
    const server = process.env.DATABASE_SERVER;
    const database = process.env.DATABASE_NAME;
    if (!server || !database) {
        throw new Error("DATABASE_SERVER and DATABASE_NAME must be set.");
    }
    const token = await getToken();
    const config = {
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
    pool = new mssql.ConnectionPool(config);
    while (attempts < maxAttempts) {
        try {
            await pool.connect();
            return pool;
        }
        catch (err) {
            attempts++;
            if (attempts >= maxAttempts) {
                throw new Error(`[DB] Connect failed after ${maxAttempts} attempts: ${err instanceof Error ? err.message : String(err)}`);
            }
            await new Promise((r) => setTimeout(r, 6_000));
        }
    }
    throw new Error("Unreachable");
}
/**
 * Run callback inside a transaction with TenantId set on session_context.
 * The callback receives the transaction itself.
 */
export async function withTenantDb(tenantId, callback) {
    const pool = await getPool();
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();
    try {
        const ctxRequest = new mssql.Request(transaction);
        await ctxRequest
            .input("tenantId", sql.UniqueIdentifier, tenantId)
            .query("EXEC sp_set_session_context N'TenantId', @tenantId, @read_only = 1");
        const result = await callback(transaction);
        await transaction.commit();
        return result;
    }
    catch (err) {
        await transaction.rollback();
        throw err;
    }
}
/**
 * Run callback without a tenant context — for cross-tenant lookups only.
 */
export async function withAdminDb(callback) {
    const pool = await getPool();
    const request = new mssql.Request(pool);
    return callback(request);
}
// Export sql namespace for use in other files
export { sql };
//# sourceMappingURL=db.js.map