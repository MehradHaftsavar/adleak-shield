import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { withAdminDb } from "@/lib/db/client";
import { sendVerificationEmail } from "@/lib/email/resend";
import * as mssql from "mssql";

const resendSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let tenantFound = false;

    try {
      await withAdminDb(async (request) => {
        const result = await request
          .input("email", mssql.NVarChar(254), email)
          .query(
            "SELECT tenant_id, email_verified FROM Tenants WHERE email = @email"
          );

        if (result.recordset.length === 0) return;

        const tenant = result.recordset[0];
        if (tenant.email_verified) return; // already verified, do nothing

        tenantFound = true;
        const tenantId = tenant.tenant_id;

        // Invalidate existing unused tokens
        await request
          .input("tenantIdInvalidate", mssql.UniqueIdentifier, tenantId)
          .query(
            "UPDATE EmailVerificationTokens SET used = 1 WHERE tenant_id = @tenantIdInvalidate AND used = 0"
          );

        await request
          .input("tenantIdNew", mssql.UniqueIdentifier, tenantId)
          .input("tokenHash", mssql.NVarChar(64), tokenHash)
          .input("expiresAt", mssql.DateTimeOffset, expiresAt)
          .query(
            `INSERT INTO EmailVerificationTokens (tenant_id, token_hash, expires_at)
             VALUES (@tenantIdNew, @tokenHash, @expiresAt)`
          );
      });
    } catch (err) {
      console.error("[ResendVerification] DB error:", err);
    }

    if (tenantFound) {
      const verificationUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email/${rawToken}`;
      try {
        await sendVerificationEmail({ to: email, verificationUrl });
      } catch (err) {
        console.error("[ResendVerification] Email error:", err);
      }
    }

    // Always return same response — don't reveal if email exists
    return NextResponse.json({
      success: true,
      message:
        "If an unverified account exists with that email, a new verification link has been sent.",
    });
  } catch (err) {
    console.error("[ResendVerification] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}