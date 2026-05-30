import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { email, tenantId } = session.user;

  return (
    <DashboardShell email={email ?? ''} tenantId={tenantId}>
      {children}
    </DashboardShell>
  );
}
