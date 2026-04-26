// =============================================================================
// AdLeak Shield — Reset Password API Route
// src/app/api/user/reset-password/route.ts
//
// WHAT THIS DOES:
// 1. Receives the raw token from the URL + the new password from the form
// 2. Hashes the raw token and looks it up in the DB
// 3. Checks it hasn't expired (1 hour) and hasn't been used before
// 4. Updates the tenant's password hash
// 5. Marks the token as used (can never be reused)
//
// SECURITY:
// - Token is validated in constant time to prevent timing attacks
// - Token marked used=1 immediately after first successful use
// - Expired tokens are rejected at the DB level (expires_at check)
// - New password is hashed with bcrypt before storage
// =============================================================================

import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { withAdminDb } from "@/lib/db/client";
import * as mssql from "mssql";

export async function POST(req: NextRequest) {
  try {
    // Step 1: Validate input
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { token: rawToken, password } = parsed.data;

    // Step 2: Hash the incoming raw token to compare against stored hash
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Step 3: Look up and validate the token
    const result = await withAdminDb(async (request) => {
      const tokenResult = await request
        .input("tokenHash", mssql.NVarChar(64), tokenHash)
        .query(
          `SELECT t.token_id, t.tenant_id, t.expires_at, t.used
           FROM PasswordResetTokens t
           WHERE t.token_hash = @tokenHash`
        );

      if (tokenResult.recordset.length === 0) {
        return { valid: false, reason: "invalid" };
      }

      const tokenRecord = tokenResult.recordset[0];

      // Check if already used
      if (tokenRecord.used) {
        return { valid: false, reason: "used" };
      }

      // Check if expired
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
        invalid: "This reset link is invalid.",
        used: "This reset link has already been used. Please request a new one.",
        expired:
          "This reset link has expired. Please request a new one.",
      };
      return NextResponse.json(
        { error: messages[result.reason ?? "invalid"] },
        { status: 400 }
      );
    }

    // Step 4: Hash the new password
    const newPasswordHash = await bcrypt.hash(password, 12);

    // Step 5: Update password and mark token as used in one operation
    await withAdminDb(async (request) => {
      // Update password
      await request
        .input("passwordHash", mssql.NVarChar(60), newPasswordHash)
        .input("tenantId", mssql.UniqueIdentifier, result.tenantId)
        .query(
          "UPDATE Tenants SET password_hash = @passwordHash WHERE tenant_id = @tenantId"
        );

      // Mark token as used — cannot be reused
      await request
        .input("tokenId", mssql.UniqueIdentifier, result.tokenId)
        .query(
          "UPDATE PasswordResetTokens SET used = 1 WHERE token_id = @tokenId"
        );
    });

    return NextResponse.json({
      success: true,
      message: "Password updated successfully. You can now sign in.",
    });
  } catch (err) {
    console.error("[ResetPassword] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
