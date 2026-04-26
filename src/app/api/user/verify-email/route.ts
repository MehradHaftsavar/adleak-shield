import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { withAdminDb } from "@/lib/db/client";
import * as mssql from "mssql";

const verifySchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { token: rawToken } = parsed.data;
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const result = await withAdminDb(async (request) => {
      const tokenResult = await request
        .input("tokenHash", mssql.NVarChar(64), tokenHash)
        .query(
          `SELECT token_id, tenant_id, expires_at, used
           FROM EmailVerificationTokens
           WHERE token_hash = @tokenHash`
        );

      if (tokenResult.recordset.length === 0) {
        return { valid: false, reason: "invalid" };
      }

      const tokenRecord = tokenResult.recordset[0];

      if (tokenRecord.used) {
        return { valid: false, reason: "used" };
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        return { valid: false, reason: "expired" };
      }

      return {
        valid: true,
        tokenId: tokenRecord.token_id,
        tenantId: tokenRecord.tenant_id,
      };
    });

    if (!result.valid) {
      const messages: Record<string, string> = {
        invalid: "This verification link is invalid.",
        used: "This email has already been verified. Please sign in.",
        expired: "This verification link has expired. Please request a new one.",
      };
      return NextResponse.json(
        { error: messages[result.reason ?? "invalid"] },
        { status: 400 }
      );
    }

    // Mark verified and consume token
    await withAdminDb(async (request) => {
      await request
        .input("tenantId", mssql.UniqueIdentifier, result.tenantId)
        .query("UPDATE Tenants SET email_verified = 1 WHERE tenant_id = @tenantId");

      await request
        .input("tokenId", mssql.UniqueIdentifier, result.tokenId)
        .query("UPDATE EmailVerificationTokens SET used = 1 WHERE token_id = @tokenId");
    });

    return NextResponse.json({
      success: true,
      message: "Email verified successfully.",
    });
  } catch (err) {
    console.error("[VerifyEmail] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}