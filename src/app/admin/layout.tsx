// =============================================================================
// AdLeak Shield — Admin Layout
// src/app/admin/layout.tsx
//
// SERVER COMPONENT — verifies owner status on the server.
// Returns 404 for non-owners (double check; middleware already blocks).
// Renders the admin nav + impersonation banner around child pages.
// =============================================================================

import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata = {
  title: 'Admin — AdLeak Shield',
  // Prevent search engines indexing the admin panel
  robots: 'noindex, nofollow',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Server-side owner check — belt-and-braces after middleware
  if (!session?.user?.isOwner) {
    notFound(); // renders Next.js 404 page
  }

  return (
    <AdminShell ownerEmail={session.user.email ?? ''}>
      {children}
    </AdminShell>
  );
}
