// =============================================================================
// AdLeak Shield — NextAuth.js v5 Configuration
// src/lib/auth/config.ts
// =============================================================================

import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withAdminDb } from "@/lib/db/client";
import { signInSchema } from "@/lib/validators/auth";
import * as mssql from "mssql";
import type { AccessibleDomain, PlanType } from "@/types/auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 60 * 60, // 1 hour in seconds
  },

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // ── First sign-in ────────────────────────────────────────────────────────
      if (user) {
        token.tenantId          = user.tenantId;
        token.isOwner           = user.isOwner;
        token.subscriptionStatus = user.subscriptionStatus;
        token.trialEndsAt       = user.trialEndsAt;
        token.onboardingCompleted = user.onboardingCompleted;
        token.allAccessibleDomains = (user.allAccessibleDomains ?? []) as AccessibleDomain[];
        token.activeTenantId    = user.tenantId; // default to own tenant
        token.planType          = (user.planType ?? 'starter') as PlanType;
      }

      // ── Session updates ───────────────────────────────────────────────────────
      if (trigger === "update") {
        // Allow clients to stamp onboardingCompleted without a full DB round-trip
        if (session?.onboardingCompleted !== undefined) {
          token.onboardingCompleted = session.onboardingCompleted;
        }

        // Allow clients to stamp planType immediately after a successful upgrade
        if (session?.planType !== undefined) {
          token.planType = session.planType as PlanType;
        }

        // Domain switching — validate the requested tenant is actually accessible
        if (session?.activeTenantId !== undefined) {
          const domains = (token.allAccessibleDomains ?? []) as AccessibleDomain[];
          const ownTenantId = token.tenantId as string;
          const requested = session.activeTenantId as string;
          const allowed =
            requested === ownTenantId ||
            domains.some(d => d.tenantId === requested);
          if (allowed) {
            token.activeTenantId = requested;
          }
          // Silently ignore unauthorised switch attempts
        }

        // Re-fetch member domains after accepting an invite
        if (session?.refreshAccessibleDomains) {
          try {
            const memberRows = await withAdminDb(async (req) => {
              const r = await req
                .input('email', mssql.NVarChar(255), token.email as string)
                .query(`
                  SELECT tm.tenant_id, tm.role, t.email AS tenant_owner_email,
                         d.domain_id, d.domain_name
                  FROM   TeamMembers tm
                  INNER JOIN Tenants t          ON t.tenant_id  = tm.tenant_id
                  INNER JOIN MemberDomainAccess mda ON mda.member_id = tm.member_id
                  INNER JOIN Domains d          ON d.domain_id  = mda.domain_id
                  WHERE  tm.email = @email AND tm.accepted_at IS NOT NULL
                `);
              return r.recordset;
            });
            const ownDomains = ((token.allAccessibleDomains ?? []) as AccessibleDomain[])
              .filter(d => d.role === 'owner');
            const memberDomains: AccessibleDomain[] = memberRows.map((row: any) => ({
              tenantId:        row.tenant_id,
              domainId:        row.domain_id,
              domainName:      row.domain_name,
              role:            row.role as 'editor' | 'visitor',
              tenantOwnerEmail: row.tenant_owner_email,
            }));
            token.allAccessibleDomains = [...ownDomains, ...memberDomains];
          } catch (err) {
            console.error('[Auth] refreshAccessibleDomains failed (non-fatal):', err);
          }
        }

        // Subscription status — accept direct value or re-fetch from DB
        if (session?.subscriptionStatus !== undefined) {
          token.subscriptionStatus = session.subscriptionStatus;
        } else if (
          session?.activeTenantId === undefined &&
          session?.onboardingCompleted === undefined &&
          session?.planType === undefined &&
          !session?.refreshAccessibleDomains
        ) {
          // Only do the DB round-trip when no specific field was targeted
          try {
            const fresh = await withAdminDb(async (req) => {
              const result = await req
                .input("tenantId", mssql.UniqueIdentifier, token.tenantId as string)
                .query(`
                  SELECT subscription_status, trial_ends_at,
                         ISNULL(plan_type, 'starter') AS plan_type
                  FROM   Tenants
                  WHERE  tenant_id = @tenantId
                `);
              return result.recordset[0] ?? null;
            });
            if (fresh) {
              token.subscriptionStatus = fresh.subscription_status;
              token.trialEndsAt = fresh.trial_ends_at
                ? new Date(fresh.trial_ends_at).toISOString()
                : token.trialEndsAt;
              token.planType = (fresh.plan_type ?? 'starter') as PlanType;
            }
          } catch {
            // Non-fatal — keep existing token values
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.tenantId           = token.tenantId as string;
        session.user.isOwner            = token.isOwner as boolean;
        session.user.subscriptionStatus = token.subscriptionStatus as string;
        session.user.trialEndsAt        = token.trialEndsAt as string;
        session.user.onboardingCompleted = token.onboardingCompleted as boolean;
        session.user.allAccessibleDomains = ((token.allAccessibleDomains ?? []) as AccessibleDomain[]);
        session.user.activeTenantId     = ((token.activeTenantId ?? token.tenantId) as string);
        session.user.planType           = ((token.planType ?? 'starter') as PlanType);
      }
      return session;
    },

    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn     = !!auth?.user;
      const isOnDashboard  = nextUrl.pathname.startsWith("/dashboard");
      const isOnAdmin      = nextUrl.pathname.startsWith("/admin");
      const isOnAuth       = nextUrl.pathname.startsWith("/auth");
      const isOnOnboarding = nextUrl.pathname.startsWith("/onboarding");
      const isOnSettings   = nextUrl.pathname.startsWith("/settings");

      if (isOnAdmin) {
        if (isLoggedIn && auth.user.isOwner) return true;
        return new Response(null, { status: 404 });
      }

      if (isOnDashboard) {
        if (!isLoggedIn) return Response.redirect(new URL("/auth/login", nextUrl));
        if (!auth.user.onboardingCompleted) return Response.redirect(new URL("/onboarding", nextUrl));
        return true;
      }

      if (isOnSettings) {
        if (!isLoggedIn) return Response.redirect(new URL("/auth/login", nextUrl));
        if (!auth.user.onboardingCompleted) return Response.redirect(new URL("/onboarding", nextUrl));
        return true;
      }

      if (isOnOnboarding && isLoggedIn && auth.user.onboardingCompleted) {
        return Response.redirect(new URL("/settings", nextUrl));
      }

      if (isOnAuth && isLoggedIn) {
        if (!auth.user.onboardingCompleted) return Response.redirect(new URL("/onboarding", nextUrl));
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },

  providers: [
    Credentials({
      async authorize(credentials) {
        // Step 1: Validate input
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Step 2: Fetch tenant by email (admin connection — no RLS needed yet)
        let tenant: {
          tenant_id: string;
          email: string;
          password_hash: string;
          is_owner: boolean;
          subscription_status: string;
          trial_ends_at: Date;
          email_verified: boolean;
          onboarding_completed: boolean;
          plan_type: string;
        } | null = null;

        try {
          tenant = await withAdminDb(async (request) => {
            const result = await request
              .input("email", email.toLowerCase().trim())
              .query(`
                SELECT tenant_id, email, password_hash, is_owner,
                       subscription_status, trial_ends_at, email_verified,
                       onboarding_completed,
                       ISNULL(plan_type, 'starter') AS plan_type
                FROM   Tenants
                WHERE  email = @email
              `);
            return result.recordset[0] ?? null;
          });
        } catch (err) {
          console.error("[Auth] Database error during sign in:", err);
          return null;
        }

        if (!tenant) return null;

        // Step 3: Verify password
        const passwordValid = await bcrypt.compare(password, tenant.password_hash);
        if (!passwordValid) return null;

        if (!tenant.email_verified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        // Step 4: Load own domains + member domains (non-fatal if fails)
        let allAccessibleDomains: AccessibleDomain[] = [];
        try {
          const [ownRows, memberRows] = await Promise.all([
            withAdminDb(async (req) => {
              const r = await req
                .input('tid', mssql.UniqueIdentifier, tenant!.tenant_id)
                .query(`SELECT domain_id, domain_name FROM Domains WHERE tenant_id = @tid`);
              return r.recordset;
            }),
            withAdminDb(async (req) => {
              const r = await req
                .input('email2', mssql.NVarChar(255), email.toLowerCase().trim())
                .query(`
                  SELECT tm.tenant_id, tm.role, t.email AS tenant_owner_email,
                         d.domain_id, d.domain_name
                  FROM   TeamMembers tm
                  INNER JOIN Tenants t          ON t.tenant_id  = tm.tenant_id
                  INNER JOIN MemberDomainAccess mda ON mda.member_id = tm.member_id
                  INNER JOIN Domains d          ON d.domain_id  = mda.domain_id
                  WHERE  tm.email = @email2 AND tm.accepted_at IS NOT NULL
                `);
              return r.recordset;
            }),
          ]);

          allAccessibleDomains = [
            ...ownRows.map((row: any) => ({
              tenantId:        tenant!.tenant_id,
              domainId:        row.domain_id,
              domainName:      row.domain_name,
              role:            'owner' as const,
              tenantOwnerEmail: tenant!.email,
            })),
            ...memberRows.map((row: any) => ({
              tenantId:        row.tenant_id,
              domainId:        row.domain_id,
              domainName:      row.domain_name,
              role:            row.role as 'editor' | 'visitor',
              tenantOwnerEmail: row.tenant_owner_email,
            })),
          ];
        } catch (err) {
          console.error('[Auth] Domain/member lookup failed (non-fatal):', err);
          // Login still succeeds — user gets their own data with empty accessible list
        }

        // Step 5: Return user object seeded into the JWT
        return {
          id:                   tenant.tenant_id,
          email:                tenant.email,
          tenantId:             tenant.tenant_id,
          isOwner:              tenant.is_owner,
          subscriptionStatus:   tenant.subscription_status,
          trialEndsAt:          tenant.trial_ends_at.toISOString(),
          onboardingCompleted:  tenant.onboarding_completed ?? false,
          allAccessibleDomains,
          planType:             (tenant.plan_type ?? 'starter') as PlanType,
        };
      },
    }),
  ],
};
