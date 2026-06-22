import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import type { AccessibleDomain, PlanType } from "@/types/auth";

const edgeConfig: NextAuthConfig = {
  pages: {
    signIn: "/auth/login",
    error:  "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60,
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn    = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnAdmin     = nextUrl.pathname.startsWith("/admin");
      const isOnAuth      = nextUrl.pathname.startsWith("/auth");

      if (isOnAdmin) {
        if (isLoggedIn && auth.user.isOwner) return true;
        return Response.redirect(new URL("/auth/login", nextUrl));
      }
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return Response.redirect(new URL("/auth/login", nextUrl));
      }
      if (isOnAuth && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },

    async jwt({ token, user }) {
      // Only runs on sign-in when user object is present (edge env)
      if (user) {
        token.tenantId             = user.tenantId;
        token.isOwner              = user.isOwner;
        token.subscriptionStatus   = user.subscriptionStatus;
        token.trialEndsAt          = user.trialEndsAt;
        token.onboardingCompleted  = user.onboardingCompleted;
        token.allAccessibleDomains = (user.allAccessibleDomains ?? []) as AccessibleDomain[];
        token.activeTenantId       = user.tenantId;
        token.planType             = (user.planType ?? 'starter') as PlanType;
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.tenantId            = token.tenantId as string;
        session.user.isOwner             = token.isOwner as boolean;
        session.user.subscriptionStatus  = token.subscriptionStatus as string;
        session.user.trialEndsAt         = token.trialEndsAt as string;
        session.user.onboardingCompleted = token.onboardingCompleted as boolean;
        session.user.allAccessibleDomains = ((token.allAccessibleDomains ?? []) as AccessibleDomain[]);
        session.user.activeTenantId      = ((token.activeTenantId ?? token.tenantId) as string);
        session.user.planType            = ((token.planType ?? 'starter') as PlanType);
      }
      return session;
    },
  },
  providers: [],
};

export const { auth, handlers } = NextAuth(edgeConfig);
