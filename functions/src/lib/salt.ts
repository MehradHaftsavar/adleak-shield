// =============================================================================
// AdLeak Shield — Daily Salt
// functions/src/lib/salt.ts
//
// The visitor hash is HMAC(salt, domain|ip|userAgent). The salt rotates every
// UTC day and the janitor deletes anything older than 48 hours, so once a
// salt is gone the hashes it produced can no longer be linked to a visit by
// anyone — including us. That is what makes the identifier genuinely
// short-lived rather than merely obscured.
//
// Two salts stay live at once (today's and yesterday's) so a visit that spans
// midnight can still be matched.
// =============================================================================

import mssql from "mssql";
import { randomBytes } from "node:crypto";
import { withAdminDb } from "./db.js";

// Cached per UTC date. Azure recycles workers freely and never shares memory
// between instances, so this is only ever an optimisation — a miss costs one
// query, never correctness. Keying by date matters: an instance alive across
// midnight must notice the day rolled over rather than serving a stale salt.
let cachedDate: string | null = null;
let cachedSalt: string | null = null;

/** Current UTC date as YYYY-MM-DD. Must be UTC everywhere or instances disagree. */
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().substring(0, 10);
}

/**
 * Fetch (or create) the salt for a given UTC day.
 *
 * Several instances can hit a brand-new day simultaneously and each try to
 * create the salt. salt_date is the primary key, so exactly one INSERT wins;
 * the losers swallow the duplicate-key error and read back the winner's value.
 * Without this, two instances would hash the same visitor differently and
 * sessions would silently fail to match.
 */
export async function getSaltForDate(date: string): Promise<string> {
  const candidate = randomBytes(32).toString("hex");

  return withAdminDb(async (request) => {
    const result = await request
      .input("saltDate", mssql.Date, date)
      .input("candidate", mssql.VarChar(64), candidate)
      .query(`
        SET NOCOUNT ON;
        BEGIN TRY
          INSERT INTO HashSalts (salt_date, salt_value) VALUES (@saltDate, @candidate);
        END TRY
        BEGIN CATCH
          -- 2601/2627 = duplicate key: another instance created it first, which
          -- is the expected outcome of the race. Anything else is a real error.
          IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
        END CATCH

        SELECT salt_value FROM HashSalts WHERE salt_date = @saltDate;
      `);

    const salt = result.recordset[0]?.salt_value;
    if (!salt) throw new Error(`[Salt] No salt available for ${date}`);
    return salt as string;
  });
}

/** Today's salt, cached in-process for the current UTC day. */
export async function getTodaySalt(): Promise<string> {
  const today = utcDateString();
  if (cachedDate === today && cachedSalt) return cachedSalt;

  const salt = await getSaltForDate(today);
  cachedDate = today;
  cachedSalt = salt;
  return salt;
}

/** Yesterday's salt — used when matching a visit that began before midnight. */
export async function getYesterdaySalt(): Promise<string | null> {
  const yesterday = utcDateString(new Date(Date.now() - 86_400_000));
  return withAdminDb(async (request) => {
    const result = await request
      .input("saltDate", mssql.Date, yesterday)
      .query(`SELECT salt_value FROM HashSalts WHERE salt_date = @saltDate`);
    return (result.recordset[0]?.salt_value as string) ?? null;
  });
}
