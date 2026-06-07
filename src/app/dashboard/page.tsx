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

  const { tenantId, email } = session.user;

  return (
    <DashboardShell
      email={email ?? ""}
      tenantId={tenantId}
    >
      <DashboardContent />
    </DashboardShell>
  );
}
