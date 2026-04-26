// =============================================================================
// AdLeak Shield — NextAuth Type Augmentation
// src/types/next-auth.d.ts
//
// WHY DOES THIS FILE EXIST?
// NextAuth's default Session type only includes: name, email, image.
// We added custom fields (tenantId, isOwner, etc.) to the session in config.ts.
// Without this file, TypeScript doesn't know those fields exist and will
// show errors whenever you try to access session.user.tenantId.
//
// This file "augments" (extends) NextAuth's types with our custom fields.
// You never import this file — TypeScript picks it up automatically.
// =============================================================================

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      tenantId: string;
      isOwner: boolean;
      subscriptionStatus: string;
      trialEndsAt: string;
    } & DefaultSession["user"];
  }

  interface User {
    tenantId: string;
    isOwner: boolean;
    subscriptionStatus: string;
    trialEndsAt: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId: string;
    isOwner: boolean;
    subscriptionStatus: string;
    trialEndsAt: string;
  }
}
