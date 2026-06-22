// Shared auth types — imported by next-auth.d.ts and other files that need them.
export interface AccessibleDomain {
  tenantId: string;
  domainId: string;
  domainName: string;
  role: 'owner' | 'editor' | 'visitor';
  tenantOwnerEmail: string;
}

export type PlanType = 'starter' | 'freelancer' | 'agency';
