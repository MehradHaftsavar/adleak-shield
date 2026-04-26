// =============================================================================
// AdLeak Shield — Forgot Password API Route
// src/app/api/user/forgot-password/route.ts
//
// WHAT THIS DOES:
// 1. Validates the email with Zod
// 2. Looks up the tenant (but returns success either way — no email enumeration)
// 3. Generates a cryptographically secure random token
// 4. Stores the SHA-256 hash of the token in the DB (never the raw token)
// 5. Sends an email with a link containing the raw token
// 6. Token expires in 1 hour and can only be used once
//
// SECURITY:
// - We ALWAYS return the same success message regardless of whether the email
//   exists. This prevents attackers from discovering registered emails.
// - We store only the SHA-256 hash — if the DB is breached, tokens are useless
// - One-time use: token is marked used=true after first use
// - 1 hour expiry enforced at the database level
// =============================================================================

import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { withAdminDb } from "@/lib/db/client";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import * as mssql from "mssql";

export async function POST(req: NextRequest) {
  try {
    // Step 1: Validate input
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Step 2: Generate a secure random token BEFORE the DB lookup
    // 32 bytes = 256 bits of entropy — cannot be guessed
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Step 3: Look up tenant and store token if found
    let tenantFound = false;

    try {
      await withAdminDb(async (request) => {
        const result = await request
          .input("email", mssql.NVarChar(254), email)
          .query(
            "SELECT tenant_id FROM Tenants WHERE email = @email"
          );

        if (result.recordset.length === 0) {
          // Email not found — we still return success to prevent enumeration
          return;
        }

        const tenantId = result.recordset[0].tenant_id;
        tenantFound = true;

        // Invalidate any existing unused tokens for this tenant
        const request2 = new (await import("mssql")).Request();
        await request
          .input("tenantId", mssql.UniqueIdentifier, tenantId)
          .query(
            "UPDATE PasswordResetTokens SET used = 1 WHERE tenant_id = @tenantId AND used = 0"
          );

        // Store the new token hash
        await request
          .input("tenantId2", mssql.UniqueIdentifier, tenantId)
          .input("tokenHash", mssql.NVarChar(64), tokenHash)
          .input("expiresAt", mssql.DateTimeOffset, expiresAt)
          .query(
            `INSERT INTO PasswordResetTokens (tenant_id, token_hash, expires_at)
             VALUES (@tenantId2, @tokenHash, @expiresAt)`
          );
      });
    } catch (err) {
      console.error("[ForgotPassword] DB error:", err);
      // Still return success — don't reveal DB errors to the client
    }

    // Step 4: Send the email only if tenant was found
    if (tenantFound) {
      const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password/${rawToken}`;
      try {
        await sendPasswordResetEmail({ to: email, resetUrl });
      } catch (err) {
        console.error("[ForgotPassword] Email send error:", err);
        // Log but don't expose — user will see generic success message
      }
    }

    // ALWAYS return the same response — never reveal if email exists
    return NextResponse.json({
      success: true,
      message:
        "If an account exists with that email, you will receive a reset link shortly.",
    });
  } catch (err) {
    console.error("[ForgotPassword] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
