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

import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { LegalFooter } from "@/components/layout/LegalFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdLeak Shield — Stop Wasting Google Ads Budget",
  description:
    "Identify which Google Ads keywords are burning your budget without generating real engagement. Built for small businesses running Google Ads.",
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
      <body className="bg-gray-50 text-gray-900 antialiased flex flex-col min-h-screen">
        {/* refetchOnWindowFocus (default true) re-validates the JWT whenever the
            user returns to the tab — enough to catch expired sessions without
            polling. Combined with the unauthenticated redirect in DashboardShell. */}
        <SessionProvider session={session}>
          <div className="flex flex-col min-h-screen">
            {children}
            <LegalFooter />
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
