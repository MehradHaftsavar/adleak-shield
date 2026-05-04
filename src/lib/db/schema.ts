// =============================================================================
// AdLeak Shield — Database Schema Types
// src/lib/db/schema.ts
//
// Drizzle ORM's mssql-core module is not yet stable.
// We define our table structure as plain TypeScript types that mirror
// the SQL schema in infra/sql/01_schema.sql exactly.
// These types are used throughout the application for type safety.
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
  slot_number: 1 | 2 | 3;
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
  // Phase 3.1 additions
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
  // Phase 3.1 addition
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
// TABLE NAME CONSTANTS
// Use these instead of typing raw strings to prevent typos in queries.
// =============================================================================
export const Tables = {
  Tenants: "Tenants",
  PasswordResetTokens: "PasswordResetTokens",
  Domains: "Domains",
  Campaigns: "Campaigns",
  Sessions: "Sessions",
  ClickLogs: "ClickLogs",
  JourneyEvents: "JourneyEvents",
  UnregisteredTrafficLog: "UnregisteredTrafficLog",
} as const;