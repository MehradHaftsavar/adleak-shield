// =============================================================================
// AdLeak Shield — Root Layout
// src/app/layout.tsx
//
// WHAT IS THE ROOT LAYOUT?
// Every page in a Next.js app shares this layout.
// It's like the outer shell — sets the HTML document structure,
// loads fonts, and wraps everything in any providers that need to be global.
//
// SessionProvider: makes the NextAuth session available to all client
// components throughout the app via the useSession() hook.
// =============================================================================

import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "AdLeak Shield — Google Ads Clicks But No Calls or Sales? Find Your Wasted Keywords",
  description:
    "Getting clicks on Google Ads but no calls, leads, or sales? AdLeak Shield shows you exactly which keywords are wasting your budget — and lets you cut them in one click. Free 7-day trial.",
  keywords: [
    "Google Ads clicks no conversions",
    "Google Ads wasted spend",
    "Google Ads negative keywords tool",
    "why am I getting Google Ads clicks but no leads",
    "Google Ads budget wasted",
    "stop wasting Google Ads money",
    "Google Ads keyword analysis",
    "PPC wasted spend tracker",
  ],
  openGraph: {
    title: "AdLeak Shield — Stop Paying for Google Ads Clicks That Never Convert",
    description:
      "Find out exactly which keywords are eating your Google Ads budget without generating calls, leads, or sales. Cookieless tracking. GDPR compliant. Free 7-day trial.",
    url: "https://adleakshield.com",
    siteName: "AdLeak Shield",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AdLeak Shield — Google Ads Clicks But No Sales? Find Out Why.",
    description:
      "AdLeak Shield shows you which Google Ads keywords are wasting your budget. Cut them, get your money back. Free 7-day trial.",
  },
  alternates: {
    canonical: "https://adleakshield.com",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read session on the server to pass to SessionProvider
  const session = await auth();

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased flex flex-col min-h-screen overflow-x-hidden">
        {/* refetchOnWindowFocus (default true) re-validates the JWT whenever the
            user returns to the tab — enough to catch expired sessions without
            polling. Combined with the unauthenticated redirect in DashboardShell. */}
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
