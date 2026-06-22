// =============================================================================
// AdLeak Shield — Database Schema Types
// src/lib/db/schema.ts
// =============================================================================

// =============================================================================
// TENANTS
// =============================================================================
export interface Tenant {
  tenant_id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  trial_ends_at: Date;
  stripe_customer_id: string | null;
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  is_owner: boolean;
  plan_type: "starter" | "freelancer" | "agency";
}

export type NewTenant = Omit<Tenant, "tenant_id" | "created_at"> & {
  tenant_id?: string;
};

// =============================================================================
// PASSWORD RESET TOKENS
// =============================================================================
export interface PasswordResetToken {
  token_id: string;
  tenant_id: string;
  token_hash: string;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

export type NewPasswordResetToken = Omit<
  PasswordResetToken,
  "token_id" | "created_at"
>;

// =============================================================================
// DOMAINS
// =============================================================================
export interface Domain {
  domain_id: string;
  tenant_id: string;
  domain_name: string;
  created_at: Date;
  verified: boolean;
}

export type NewDomain = Omit<Domain, "domain_id" | "created_at"> & {
  domain_id?: string;
};

// =============================================================================
// CAMPAIGNS
// =============================================================================
export interface Campaign {
  campaign_id: string;
  tenant_id: string;
  domain_id: string;
  google_campaign_id: string;
  slot_number: number; // 1–10 depending on plan
  created_at: Date;
  status: "awaiting_data" | "active" | "unregistered_traffic_detected";
}

export type NewCampaign = Omit<Campaign, "campaign_id" | "created_at"> & {
  campaign_id?: string;
};

// =============================================================================
// SESSIONS
// =============================================================================
export interface Session {
  session_id: string;
  tenant_id: string;
  campaign_id: string;
  session_fingerprint: string;
  keyword: string | null;
  match_type: string | null;
  device: string | null;
  gclid: string | null;
  ip_masked: string | null;
  started_at: Date;
  total_duration_ms: number | null;
  is_bounce: boolean;
}

export type NewSession = Omit<Session, "session_id" | "started_at"> & {
  session_id?: string;
};

// =============================================================================
// CLICK LOGS
// =============================================================================
export interface ClickLog {
  click_id: string;
  tenant_id: string;
  session_id: string;
  campaign_id: string;
  keyword: string | null;
  match_type: string | null;
  landing_page_path: string | null;
  clicked_at: Date;
  estimated_cpc_gbp: number | null;
  is_validated: boolean;
  validation_failure_reason: string | null;
  session_duration: number;
}

export type NewClickLog = Omit<ClickLog, "click_id" | "clicked_at"> & {
  click_id?: string;
};

// =============================================================================
// JOURNEY EVENTS
// =============================================================================
export interface JourneyEvent {
  event_id: string;
  tenant_id: string;
  session_id: string;
  event_type: "pageview" | "click" | "success_event" | "heartbeat";
  page_path: string | null;
  element_tag: string | null;
  element_href: string | null;
  scroll_depth_pct: number | null;
  dwell_time_ms: number | null;
  occurred_at: Date;
  is_success_event: boolean;
}

export type NewJourneyEvent = Omit<JourneyEvent, "event_id" | "occurred_at"> & {
  event_id?: string;
};

// =============================================================================
// UNREGISTERED TRAFFIC LOG
// =============================================================================
export interface UnregisteredTrafficLog {
  log_id: string;
  tenant_id: string | null;
  unrecognised_campaign_id: string;
  referring_domain: string | null;
  logged_at: Date;
}

export type NewUnregisteredTrafficLog = Omit<
  UnregisteredTrafficLog,
  "log_id" | "logged_at"
> & { log_id?: string };

// =============================================================================
// TEAM MEMBERS
// =============================================================================
export interface TeamMember {
  member_id: string;
  tenant_id: string;
  email: string;
  role: "editor" | "visitor";
  added_at: Date;
  accepted_at: Date | null;
}

export type NewTeamMember = Omit<TeamMember, "member_id" | "added_at"> & {
  member_id?: string;
};

// =============================================================================
// TEAM INVITATIONS
// =============================================================================
export interface TeamInvitation {
  invitation_id: string;
  tenant_id: string;
  member_id: string;
  token_hash: string;
  invited_by_email: string;
  email: string;
  role: "editor" | "visitor";
  expires_at: Date;
  created_at: Date;
  accepted_at: Date | null;
}

export type NewTeamInvitation = Omit<
  TeamInvitation,
  "invitation_id" | "created_at"
> & { invitation_id?: string };

// =============================================================================
// MEMBER DOMAIN ACCESS
// =============================================================================
export interface MemberDomainAccess {
  access_id: string;
  member_id: string;
  domain_id: string;
  granted_at: Date;
}

export type NewMemberDomainAccess = Omit<MemberDomainAccess, "access_id" | "granted_at"> & {
  access_id?: string;
};

// =============================================================================
// TABLE NAME CONSTANTS
// =============================================================================
export const Tables = {
  Tenants:               "Tenants",
  PasswordResetTokens:   "PasswordResetTokens",
  Domains:               "Domains",
  Campaigns:             "Campaigns",
  Sessions:              "Sessions",
  ClickLogs:             "ClickLogs",
  JourneyEvents:         "JourneyEvents",
  UnregisteredTrafficLog: "UnregisteredTrafficLog",
  TeamMembers:           "TeamMembers",
  TeamInvitations:       "TeamInvitations",
  MemberDomainAccess:    "MemberDomainAccess",
} as const;
