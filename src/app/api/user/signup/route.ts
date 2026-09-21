import { type NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { signUpSchema } from "@/lib/validators/auth";
import { withAdminDb } from "@/lib/db/client";
import { sendVerificationEmail } from "@/lib/email/resend";
import { TERMS_VERSION } from "@/lib/legal";
import * as mssql from "mssql";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signUpSchema.safeParse(body);

    if (!parsed.success) {
      console.log("[Signup] Validation failed:", parsed.error.errors);
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const rawPlan = body?.plan;
    const planType: string = (rawPlan === 'freelancer' || rawPlan === 'agency') ? rawPlan : 'starter';
    console.log("[Signup] Attempting signup for:", email);

    const passwordHash = await bcrypt.hash(password, 10);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let tenantId: string | null = null;
    let alreadyExists = false;

    try {
      tenantId = await withAdminDb(async (request) => {
        console.log("[Signup] Checking if email exists...");
        const existing = await request
          .input("emailCheck", mssql.NVarChar(254), email)
          .query("SELECT tenant_id FROM Tenants WHERE email = @emailCheck");

        console.log("[Signup] Existing rows:", existing.recordset.length);

        if (existing.recordset.length > 0) {
          alreadyExists = true;
          return null;
        }

        // Check if this email was previously used for a trial on a deleted account.
        // We store a SHA-256 hash (no raw PII) so we can detect re-signups even
        // when the person uses a completely different domain and campaign ID.
        const emailHash = crypto
          .createHash('sha256')
          .update(email.toLowerCase().trim())
          .digest('hex');

        const trialledEmail = await request
          .input('emailHash', mssql.NVarChar(64), emailHash)
          .query(`
            SELECT 1 FROM TrialledResources
            WHERE resource_type = 'email' AND resource_value = @emailHash
          `);

        const hadPriorTrial = trialledEmail.recordset.length > 0;

        // Genuine first-timer gets 7 days; repeat sign-up gets trial_ends_at = now
        // so they're immediately paywalled — they already had their free trial.
        const trialEndsAt = hadPriorTrial
          ? new Date()
          : (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d; })();

        const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim();
        const isOwner = email === ownerEmail;

        console.log("[Signup] Inserting new tenant...");

        const newTenant = await request
          .input("emailNew", mssql.NVarChar(254), email)
          .input("passwordHash", mssql.NVarChar(60), passwordHash)
          .input("trialEndsAt", mssql.DateTimeOffset, trialEndsAt)
          .input("isOwner", mssql.Bit, isOwner)
          .input("planType", mssql.NVarChar(20), planType)
          // Evidence of the clickwrap. The signup form will not submit without
          // the box ticked (src/app/auth/signup/page.tsx), so reaching this
          // INSERT is itself the acceptance — but Article 28 needs us to be
          // able to show WHAT was accepted and WHEN, not merely that it was.
          // Stamped server-side rather than taken from the request body, so a
          // crafted POST cannot backdate or misattribute an acceptance.
          .input("termsVersion", mssql.NVarChar(20), TERMS_VERSION)
          .query(
            `INSERT INTO Tenants
              (email, password_hash, trial_ends_at, is_owner, subscription_status, email_verified, plan_type,
               terms_accepted_at, terms_version)
             OUTPUT INSERTED.tenant_id
             VALUES
              (@emailNew, @passwordHash, @trialEndsAt, @isOwner, 'trialing', 0, @planType,
               SYSUTCDATETIME(), @termsVersion)`
          );

        console.log("[Signup] Tenant inserted, recordset:", newTenant.recordset);

        const newTenantId = newTenant.recordset[0]?.tenant_id;
        if (!newTenantId) {
          throw new Error("INSERT did not return a tenant_id");
        }

        console.log("[Signup] Inserting verification token...");

        await request
          .input("tenantIdToken", mssql.UniqueIdentifier, newTenantId)
          .input("tokenHash", mssql.NVarChar(64), tokenHash)
          .input("expiresAt", mssql.DateTimeOffset, tokenExpiresAt)
          .query(
            `INSERT INTO EmailVerificationTokens (tenant_id, token_hash, expires_at)
             VALUES (@tenantIdToken, @tokenHash, @expiresAt)`
          );

        console.log("[Signup] Token inserted successfully");
        return newTenantId;
      });
    } catch (err) {
      console.error("[Signup] DB ERROR:", err);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    if (alreadyExists) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    console.log("[Signup] Sending verification email to:", email);
    const verificationUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email/${rawToken}`;
    try {
      await sendVerificationEmail({ to: email, verificationUrl });
      console.log("[Signup] Email sent successfully");
    } catch (err) {
      console.error("[Signup] Email send error:", err);
    }

    return NextResponse.json(
      { success: true, message: "Account created. Please verify your email." },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Signup] Outer error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}