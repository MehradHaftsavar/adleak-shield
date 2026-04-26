// =============================================================================
// AdLeak Shield — Dashboard Page (Phase 1.2 Scaffold)
// src/app/dashboard/page.tsx
//
// This is a SERVER COMPONENT — it runs on the server, not the browser.
// It reads the session and passes data to client components.
//
// At Phase 1.2 this is a scaffold — the real dashboard content (Leak Table,
// Journey Timeline) is built in Phases 3 and 4.
// What we build here:
//   - Session reading (who is logged in)
//   - Trial status banner
//   - Skeleton loaders wired up and ready
//   - SWR provider wrapper
// =============================================================================

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardPage() {
  // Read the session on the server
  const session = await auth();

  // Should not be reachable without session (middleware handles this)
  // but we double-check here as a safety net
  if (!session?.user) {
    redirect("/auth/login");
  }

  const { tenantId, email, subscriptionStatus, trialEndsAt } = session.user;

  // Calculate days remaining in trial
  const trialEnd = new Date(trialEndsAt);
  const now = new Date();
  const daysRemaining = Math.ceil(
    (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isTrialing = subscriptionStatus === "trialing" && daysRemaining > 0;
  const isExpired = subscriptionStatus === "trialing" && daysRemaining <= 0;

  return (
    <DashboardShell
      email={email ?? ""}
      tenantId={tenantId}
      isTrialing={isTrialing}
      isExpired={isExpired}
      daysRemaining={daysRemaining}
    />
  );
}
