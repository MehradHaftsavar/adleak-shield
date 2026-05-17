// =============================================================================
// AdLeak Shield — NextAuth.js v5 Configuration
// src/lib/auth/config.ts
//
// WHAT IS THIS FILE?
// NextAuth.js handles everything to do with logging in and out.
// This file configures:
//   1. How users log in (email + password — "credentials provider")
//   2. What gets stored in the session (who is logged in)
//   3. What happens when they try to access protected pages
//
// SECURITY DECISIONS:
// - Passwords are hashed with bcrypt (cost factor 12) — never stored plain
// - Session uses JWT strategy — no session table needed in the database
// - JWT is encrypted with NEXTAUTH_SECRET — stored in Key Vault
// - Pre-emptive DB wake fires the moment Sign In is clicked
// =============================================================================

import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withAdminDb } from "@/lib/db/client";
import { signInSchema } from "@/lib/validators/auth";

export const authConfig: NextAuthConfig = {
  // ==========================================================================
  // PAGES
  // Tell NextAuth where our custom login/signup pages live.
  // Without this, NextAuth would use its own default ugly pages.
  // ==========================================================================
  pages: {
    signIn: "/auth/login",
    error: "/auth/login", // Redirect errors back to login page
  },

  // ==========================================================================
  // SESSION
  // JWT strategy: the session is stored in an encrypted cookie, not the DB.
  // This means no extra database table and no queries on every page load.
  // maxAge: 8 hours — user is automatically logged out after 8 hours idle.
  // ==========================================================================
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours in seconds
  },

  // ==========================================================================
  // CALLBACKS
  // These run during the auth flow to customise what gets stored in the token
  // and what the session object looks like in your components.
  // ==========================================================================
  callbacks: {
    // JWT callback: runs when the JWT token is created or updated.
    // We add tenantId, isOwner, subscriptionStatus, onboardingCompleted to the token so they're
    // available everywhere without needing another database query.
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // First sign in — user object is populated from the authorize() below
        token.tenantId = user.tenantId;
        token.isOwner = user.isOwner;
        token.subscriptionStatus = user.subscriptionStatus;
        token.trialEndsAt = user.trialEndsAt;
        token.onboardingCompleted = user.onboardingCompleted;
      }
      if (trigger === "update") {
        // Patch onboarding flag if passed
        if (session?.onboardingCompleted !== undefined) {
          token.onboardingCompleted = session.onboardingCompleted;
        }
        // Re-fetch subscription status from DB so the token reflects Stripe webhook updates
        try {
          const fresh = await withAdminDb(async (req) => {
            const result = await req
              .input("tenantId", token.tenantId as string)
              .query(`SELECT subscription_status, trial_ends_at FROM Tenants WHERE tenant_id = @tenantId`);
            return result.recordset[0] ?? null;
          });
          if (fresh) {
            token.subscriptionStatus = fresh.subscription_status;
            token.trialEndsAt = fresh.trial_ends_at ? new Date(fresh.trial_ends_at).toISOString() : token.trialEndsAt;
          }
        } catch {
          // Non-fatal — keep existing token values
        }
      }
      return token;
    },

    // Session callback: runs when session() is called in a component.
    // Copies our custom fields from the token into the session object.
    async session({ session, token }) {
      if (token) {
        session.user.tenantId = token.tenantId as string;
        session.user.isOwner = token.isOwner as boolean;
        session.user.subscriptionStatus = token.subscriptionStatus as string;
        session.user.trialEndsAt = token.trialEndsAt as string;
        session.user.onboardingCompleted = token.onboardingCompleted as boolean;
      }
      return session;
    },

    // Authorized callback: runs on every request to a protected route.
    // This is where we decide if someone can see a page.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");
      const isOnAuth = nextUrl.pathname.startsWith("/auth");
      const isOnOnboarding = nextUrl.pathname.startsWith("/onboarding");
      const isOnSettings = nextUrl.pathname.startsWith("/settings");

      // Admin routes: must be logged in AND be the owner
      if (isOnAdmin) {
        if (isLoggedIn && auth.user.isOwner) return true;
        return Response.redirect(new URL("/auth/login", nextUrl));
      }

      // Dashboard routes: must be logged in AND completed onboarding
      if (isOnDashboard) {
        if (!isLoggedIn) {
          return Response.redirect(new URL("/auth/login", nextUrl));
        }
        if (!auth.user.onboardingCompleted) {
          return Response.redirect(new URL("/onboarding", nextUrl));
        }
        return true;
      }

      // Settings routes: must be logged in AND completed onboarding
      if (isOnSettings) {
        if (!isLoggedIn) {
          return Response.redirect(new URL("/auth/login", nextUrl));
        }
        if (!auth.user.onboardingCompleted) {
          return Response.redirect(new URL("/onboarding", nextUrl));
        }
        return true;
      }

      // Onboarding route: if already completed, redirect to settings
      if (isOnOnboarding && isLoggedIn && auth.user.onboardingCompleted) {
        return Response.redirect(new URL("/settings", nextUrl));
      }

      // Auth pages: if already logged in, redirect appropriately
      if (isOnAuth && isLoggedIn) {
        if (!auth.user.onboardingCompleted) {
          return Response.redirect(new URL("/onboarding", nextUrl));
        }
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },

  // ==========================================================================
  // PROVIDERS
  // We use the "Credentials" provider — email + password login.
  // This is where we check the password against the bcrypt hash in the DB.
  // ==========================================================================
  providers: [
    Credentials({
      async authorize(credentials) {
        // Step 1: Validate the incoming data with Zod before touching the DB
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Step 2: Look up the tenant by email
        // We use withAdminDb here because we don't have a tenantId yet —
        // the user is trying to prove who they are. RLS is bypassed only
        // for this lookup, and we verify the password immediately after.
        let tenant: {
          tenant_id: string;
          email: string;
          password_hash: string;
          is_owner: boolean;
          subscription_status: string;
          trial_ends_at: Date;
          email_verified: boolean;
          onboarding_completed: boolean;
        } | null = null;

        try {
          tenant = await withAdminDb(async (request) => {
            // SECURITY: We query by email but do NOT set SESSION_CONTEXT here.
            // This is intentional — we're authenticating, not querying tenant data.
            // The password check happens immediately below.
            const result = await request
              .input("email", email.toLowerCase().trim())
              .query(
                `SELECT tenant_id, email, password_hash, is_owner, 
                        subscription_status, trial_ends_at, email_verified,
                        onboarding_completed
                 FROM Tenants 
                 WHERE email = @email`
              );
            return result.recordset[0] ?? null;
          });
        } catch (err) {
          console.error("[Auth] Database error during sign in:", err);
          return null;
        }

        if (!tenant) {
          // SECURITY: Return null (not an error message) — never reveal whether
          // an email exists in the system. "Invalid credentials" for both cases.
          return null;
        }

        // Step 3: Verify password against bcrypt hash
        const passwordValid = await bcrypt.compare(
          password,
          tenant.password_hash
        );
        if (!passwordValid) return null;

        // Block login if email is not verified
        if (!tenant.email_verified) {
          // Throw a specific error so the login page can show the right message
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        // Step 4: Return the user object — this gets stored in the JWT
        return {
          id: tenant.tenant_id,
          email: tenant.email,
          tenantId: tenant.tenant_id,
          isOwner: tenant.is_owner,
          subscriptionStatus: tenant.subscription_status,
          trialEndsAt: tenant.trial_ends_at.toISOString(),
          onboardingCompleted: tenant.onboarding_completed ?? false,
        };
      },
    }),
  ],
};