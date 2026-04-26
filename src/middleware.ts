//import { auth } from "@/lib/auth";
import { auth } from "@/lib/auth/edge";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session;

  const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
  const isOnAdmin = nextUrl.pathname.startsWith("/admin");
  const isOnAuth = nextUrl.pathname.startsWith("/auth");

  if (isOnAdmin) {
    if (isLoggedIn && session.user.isOwner) return;
    return Response.redirect(new URL("/auth/login", nextUrl));
  }

  if (isOnDashboard) {
    if (isLoggedIn) return;
    return Response.redirect(new URL("/auth/login", nextUrl));
  }

  if (isOnAuth && isLoggedIn) {
    return Response.redirect(new URL("/dashboard", nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/wake|api/user).*)",
  ],
};