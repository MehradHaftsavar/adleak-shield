// =============================================================================
// AdLeak Shield — NextAuth Type Augmentation
// src/types/next-auth.d.ts
// =============================================================================

import type { DefaultSession } from "next-auth";
import type { AccessibleDomain, PlanType } from "./auth";

declare module "next-auth" {
  interface Session {
    user: {
      tenantId: string;
      isOwner: boolean;
      subscriptionStatus: string;
      trialEndsAt: string;
      onboardingCompleted: boolean;
      allAccessibleDomains: AccessibleDomain[];
      activeTenantId: string;
      planType: PlanType;
    } & DefaultSession["user"];
  }

  interface User {
    tenantId: string;
    isOwner: boolean;
    subscriptionStatus: string;
    trialEndsAt: string;
    onboardingCompleted: boolean;
    allAccessibleDomains: AccessibleDomain[];
    planType: PlanType;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId: string;
    isOwner: boolean;
    subscriptionStatus: string;
    trialEndsAt: string;
    onboardingCompleted: boolean;
    allAccessibleDomains: AccessibleDomain[];
    activeTenantId: string;
    planType: PlanType;
  }
}
