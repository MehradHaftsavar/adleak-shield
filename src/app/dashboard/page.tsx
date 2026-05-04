// =============================================================================
// AdLeak Shield — Dashboard Page
// src/app/dashboard/page.tsx
//
// SERVER COMPONENT — reads session and passes data to client components
//
// Phase 1.2: Auth, trial status banner, skeleton loaders
// Phase 3.2: Script verification status added
// =============================================================================
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

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
    >
      {/* Phase 3.2: Dashboard content with verification status */}
      <DashboardContent />
    </DashboardShell>
  );
}
