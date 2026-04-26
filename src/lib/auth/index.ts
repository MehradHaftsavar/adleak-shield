// =============================================================================
// AdLeak Shield — NextAuth.js v5 Main Export
// src/lib/auth/index.ts
//
// This file exports the four things you need from NextAuth throughout the app:
//   - auth()        → get the current session in Server Components
//   - signIn()      → trigger login programmatically
//   - signOut()     → trigger logout
//   - handlers      → the GET/POST route handlers for /api/auth/[...nextauth]
// =============================================================================

import NextAuth from "next-auth";
import { authConfig } from "./config";

export const { auth, signIn, signOut, handlers } = NextAuth(authConfig);
