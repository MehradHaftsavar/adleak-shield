// =============================================================================
// AdLeak Shield — DB Wake Ping API Route
// src/app/api/wake/route.ts
//
// PURPOSE:
// The moment a user clicks "Sign In", the frontend calls this endpoint in the
// background. This starts waking the auto-paused Azure SQL database BEFORE
// the user finishes authenticating — so by the time they reach the dashboard,
// the DB may already be awake.
//
// This endpoint is intentionally unauthenticated — it does nothing except
// touch the DB with a SELECT 1. There is no data leak risk here.
// Rate limiting is handled at the Azure Static Web Apps / CDN layer.
// =============================================================================

import { type NextRequest, NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db/client";

export async function GET(_req: NextRequest) {
  const result = await pingDatabase();

  return NextResponse.json(
    {
      ok: result.ok,
      latencyMs: result.latencyMs,
      // Tell the frontend whether the DB is 'warm' (fast) or 'thawing' (slow)
      // Threshold: 2000ms — matches the conditional progress bar trigger in the PRD
      status: result.ok
        ? result.latencyMs < 2_000
          ? "warm"
          : "thawing"
        : "unavailable",
    },
    {
      status: result.ok ? 200 : 503,
      headers: {
        // Do not cache — always needs a fresh reading
        "Cache-Control": "no-store",
      },
    }
  );
}
