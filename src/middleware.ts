//import { auth } from "@/lib/auth";
import { auth } from "@/lib/auth/edge";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session;
  const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
  const isOnAdmin    = nextUrl.pathname.startsWith("/admin");
  const isOnApiAdmin = nextUrl.pathname.startsWith("/api/admin");
  const isOnAuth = nextUrl.pathname.startsWith("/auth");
  const isOnOnboarding = nextUrl.pathname.startsWith("/onboarding");
  const isOnSettings = nextUrl.pathname.startsWith("/settings");

  // Admin UI + API routes — must be authenticated owner.
  // SECURITY: return 404 (not 401/403/redirect) so pentesters cannot confirm
  // the route exists. A redirect to /auth/login would reveal the path.
  if (isOnAdmin || isOnApiAdmin) {
    if (isLoggedIn && session.user.isOwner) return;
    return new Response(null, { status: 404 });
  }

  // Dashboard routes: must be logged in AND completed onboarding
  if (isOnDashboard) {
    if (!isLoggedIn) {
      return Response.redirect(new URL("/auth/login", nextUrl));
    }
    if (!session.user.onboardingCompleted) {
      return Response.redirect(new URL("/onboarding", nextUrl));
    }
    return;
  }

  // Settings routes: must be logged in AND completed onboarding
  if (isOnSettings) {
    if (!isLoggedIn) {
      return Response.redirect(new URL("/auth/login", nextUrl));
    }
    if (!session.user.onboardingCompleted) {
      return Response.redirect(new URL("/onboarding", nextUrl));
    }
    return;
  }

  // Onboarding route: if already completed, redirect to dashboard
  if (isOnOnboarding && isLoggedIn && session.user.onboardingCompleted) {
    return Response.redirect(new URL("/dashboard", nextUrl));
  }

  // Auth pages: if already logged in, redirect appropriately
  if (isOnAuth && isLoggedIn) {
    if (!session.user.onboardingCompleted) {
      return Response.redirect(new URL("/onboarding", nextUrl));
    }
    return Response.redirect(new URL("/dashboard", nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/wake|api/user|api/stripe/webhook).*)",
  ],
};