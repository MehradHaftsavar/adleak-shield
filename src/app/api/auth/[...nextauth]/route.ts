// =============================================================================
// AdLeak Shield — NextAuth API Route Handler
// src/app/api/auth/[...nextauth]/route.ts
//
// WHAT IS THIS?
// NextAuth needs a special API endpoint at /api/auth/[...nextauth] to handle:
//   - POST /api/auth/signin     → processes the login form
//   - POST /api/auth/signout    → processes logout
//   - GET  /api/auth/session    → returns the current session
//   - GET  /api/auth/csrf       → CSRF token for forms
//
// The [...nextauth] in the folder name means "match any path after /api/auth/"
// This is called a "catch-all route" in Next.js.
//
// You never call these endpoints directly — NextAuth handles them automatically.
// =============================================================================

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
