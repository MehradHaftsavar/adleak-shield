//import { auth } from "@/lib/auth";
import { auth } from "@/lib/auth/edge";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session;
  const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
  const isOnAdmin = nextUrl.pathname.startsWith("/admin");
  const isOnAuth = nextUrl.pathname.startsWith("/auth");
  const isOnOnboarding = nextUrl.pathname.startsWith("/onboarding");
  const isOnSettings = nextUrl.pathname.startsWith("/settings");

  // Admin routes: must be logged in AND be the owner
  if (isOnAdmin) {
    if (isLoggedIn && session.user.isOwner) return;
    return Response.redirect(new URL("/auth/login", nextUrl));
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
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/wake|api/user).*)",
  ],
};