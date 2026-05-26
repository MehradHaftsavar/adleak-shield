// =============================================================================
// AdLeak Shield — Admin Dashboard Page
// src/app/admin/page.tsx
//
// SERVER COMPONENT — just renders the client dashboard component.
// All data fetching is done client-side via SWR for real-time updates.
// =============================================================================

import { AdminDashboard } from '@/components/admin/AdminDashboard';

export default function AdminPage() {
  return <AdminDashboard />;
}
