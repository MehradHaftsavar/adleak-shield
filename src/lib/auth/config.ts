// =============================================================================
// AdLeak Shield — NextAuth.js v5 Configuration
// src/lib/auth/config.ts
// =============================================================================

import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withAdminDb, withTenantDb } from "@/lib/db/client";
import { signInSchema } from "@/lib/validators/auth";
import * as mssql from "mssql";
import type { AccessibleDomain, PlanType } from "@/types/auth";

// Domains table is RLS-protected — must use withTenantDb (sets SESSION_CONTEXT).
// withAdminDb has no context so returns zero rows even for admin queries.
async function loadAccessibleDomains(
  email: string,
  tenantId: string,
  tenantEmail: string,
): Promise<AccessibleDomain[]> {
  // 1. Own domains — set context to own tenantId
  const ownRows = await withTenantDb(tenantId, async (req) => {
    const r = await req.query(`SELECT domain_id, domain_name FROM Domains`);
    return r.recordset as { domain_id: string; domain_name: string }[];
  });

  // 2. Member access rows — TeamMembers/MDA have no RLS, so withAdminDb is fine here
  const memberAccessRows = await withAdminDb(async (req) => {
    const r = await req
      .input('_email',    mssql.NVarChar(255),    email.toLowerCase().trim())
      .input('_tenantId', mssql.UniqueIdentifier, tenantId)
      .query(`
        SELECT tm.tenant_id, tm.role, t.email AS tenant_owner_email, mda.domain_id
        FROM   TeamMembers tm
        INNER JOIN Tenants t              ON t.tenant_id  = tm.tenant_id
        INNER JOIN MemberDomainAccess mda ON mda.member_id = tm.member_id
        INNER JOIN Tenants me             ON me.tenant_id  = @_tenantId
        WHERE  tm.email = @_email
          AND  tm.accepted_at IS NOT NULL
          AND  t.deleted_at IS NULL
          AND  tm.accepted_at >= me.created_at
      `);
    return r.recordset as { tenant_id: string; role: string; tenant_owner_email: string; domain_id: string }[];
  });

  // 3. For each unique member tenant resolve domain names via withTenantDb (RLS)
  const memberTenantIds = [...new Set(memberAccessRows.map(r => r.tenant_id))];
  const domainNameMap: Record<string, string> = {};
  for (const mtid of memberTenantIds) {
    const rows = await withTenantDb(mtid, async (req) => {
      const r = await req.query(`SELECT domain_id, domain_name FROM Domains`);
      return r.recordset as { domain_id: string; domain_name: string }[];
    });
    for (const d of rows) domainNameMap[d.domain_id] = d.domain_name;
  }

  return [
    ...ownRows.map(d => ({
      tenantId:         tenantId,
      domainId:         d.domain_id,
      domainName:       d.domain_name,
      role:             'owner' as const,
      tenantOwnerEmail: tenantEmail,
    })),
    ...memberAccessRows
      .filter(r => domainNameMap[r.domain_id])
      .map(r => ({
        tenantId:         r.tenant_id,
        domainId:         r.domain_id,
        domainName:       domainNameMap[r.domain_id],
        role:             r.role as 'editor' | 'visitor',
        tenantOwnerEmail: r.tenant_owner_email,
      })),
  ];
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
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
        // Default active domain = first of user's own domains
        const ownDomains = ((user.allAccessibleDomains ?? []) as AccessibleDomain[]).filter(d => d.tenantId === user.tenantId);
        token.activeDomainId    = ownDomains[0]?.domainId ?? null;
        token.planType          = (user.planType ?? 'starter') as PlanType;
        token.domainsRefreshedAt = Date.now();
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

        // Domain switching — validate the requested tenant+domain is actually accessible
        if (session?.activeTenantId !== undefined || session?.activeDomainId !== undefined) {
          const domains = (token.allAccessibleDomains ?? []) as AccessibleDomain[];
          const ownTenantId = token.tenantId as string;

          if (session?.activeTenantId !== undefined) {
            const requestedTenant = session.activeTenantId as string;
            const allowed = requestedTenant === ownTenantId || domains.some(d => d.tenantId === requestedTenant);
            if (allowed) token.activeTenantId = requestedTenant;
          }

          if (session?.activeDomainId !== undefined) {
            const requestedDomain = session.activeDomainId as string | null;
            if (requestedDomain === null) {
              token.activeDomainId = null;
            } else {
              const allowed = domains.some(d => d.domainId === requestedDomain);
              if (allowed) token.activeDomainId = requestedDomain;
            }
          }
        }

        // Re-fetch all accessible domains (own + member) — used after invite accept or when empty
        if (session?.refreshAccessibleDomains) {
          try {
            const refreshed = await loadAccessibleDomains(
              token.email as string,
              token.tenantId as string,
              token.email as string,
            );
            token.allAccessibleDomains = refreshed;
            // If activeDomainId is no longer valid, reset to first own domain
            const stillValid = refreshed.some(d => d.domainId === token.activeDomainId);
            if (!stillValid) {
              const ownDomains = refreshed.filter(d => d.tenantId === token.tenantId);
              token.activeDomainId = ownDomains[0]?.domainId ?? null;
            }
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
      } // end trigger === "update"

      // ── Periodic member-domain refresh (non-update path) ─────────────────────
      // Re-load allAccessibleDomains every 10 minutes so that when a workspace
      // owner deletes their account the invitee's JWT clears the stale tenant
      // within one refresh cycle rather than waiting for full token expiry.
      if (trigger !== 'update' && !user) {
        const DOMAIN_REFRESH_MS = 10 * 60 * 1000; // 10 minutes
        const lastRefresh = (token.domainsRefreshedAt as number | undefined) ?? 0;
        if (Date.now() - lastRefresh > DOMAIN_REFRESH_MS) {
          try {
            const refreshed = await loadAccessibleDomains(
              token.email as string,
              token.tenantId as string,
              token.email as string,
            );
            token.allAccessibleDomains = refreshed;
            token.domainsRefreshedAt   = Date.now();
            // If the active tenant/domain is no longer accessible, reset to own
            const stillValid = refreshed.some(d => d.domainId === token.activeDomainId);
            if (!stillValid) {
              token.activeTenantId = token.tenantId;
              const ownDomains = refreshed.filter(d => d.tenantId === token.tenantId);
              token.activeDomainId = ownDomains[0]?.domainId ?? null;
            }
          } catch {
            // Non-fatal — keep existing token values
          }

          // Also refresh subscription status/plan from the DB on the same cadence,
          // so a change made outside the app (e.g. cancellation in the Stripe
          // portal, or a webhook update) heals the JWT within one cycle instead of
          // requiring a sign-out. Runs on the same 10-minute timer as domains.
          try {
            const fresh = await withAdminDb(async (req) => {
              const r = await req
                .input('tenantId', mssql.UniqueIdentifier, token.tenantId as string)
                .query(`
                  SELECT subscription_status, trial_ends_at,
                         ISNULL(plan_type, 'starter') AS plan_type
                  FROM   Tenants
                  WHERE  tenant_id = @tenantId
                `);
              return r.recordset[0] ?? null;
            });
            if (fresh) {
              token.subscriptionStatus = fresh.subscription_status;
              token.planType = (fresh.plan_type ?? 'starter') as PlanType;
              token.trialEndsAt = fresh.trial_ends_at
                ? new Date(fresh.trial_ends_at).toISOString()
                : token.trialEndsAt;
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
        session.user.activeDomainId     = (token.activeDomainId ?? null) as string | null;
        session.user.planType           = ((token.planType ?? 'starter') as PlanType);
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allow redirect to the marketing site after account deletion sign-out
      if (url === 'https://www.adleakshield.com') return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
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
          allAccessibleDomains = await loadAccessibleDomains(
            email,
            tenant!.tenant_id,
            tenant!.email,
          );
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
