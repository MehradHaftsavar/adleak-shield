import { pgTable, serial, varchar, timestamp, integer, boolean, text, uuid } from 'drizzle-orm/pg-core';

// Tenants table
export const tenants = pgTable('Tenants', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id').defaultRandom().notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }), // User's website domain
  createdAt: timestamp('created_at').defaultNow().notNull(),
  trialEndsAt: timestamp('trial_ends_at').notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  subscriptionStatus: varchar('subscription_status', { length: 50 }).default('trial'),
  isActive: boolean('is_active').default(true).notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
});

// Campaigns table - stores registered Google Ads Campaign IDs
export const campaigns = pgTable('Campaigns', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.tenantId, { onDelete: 'cascade' }),
  campaignId: varchar('campaign_id', { length: 50 }).notNull(), // Google Ads Campaign ID
  slotNumber: integer('slot_number').notNull(), // 1, 2, or 3 (Starter limit)
  campaignName: varchar('campaign_name', { length: 255 }), // Optional friendly name
  registeredAt: timestamp('registered_at').defaultNow().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  
  // Double-Lock validation field
  linkedDomain: varchar('linked_domain', { length: 255 }).notNull(), // Must match tenants.domain
});

// ClickLogs table - stores all ad click tracking data
export const clickLogs = pgTable('ClickLogs', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.tenantId, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  keyword: varchar('keyword', { length: 500 }),
  campaignId: varchar('campaign_id', { length: 50 }), // From ValueTrack {campaignid}
  adGroupId: varchar('ad_group_id', { length: 50 }),
  matchType: varchar('match_type', { length: 50 }),
  gclid: varchar('gclid', { length: 255 }),
  device: varchar('device', { length: 50 }),
  landingPageUrl: text('landing_page_url'),
  referrer: text('referrer'),
  maskedIp: varchar('masked_ip', { length: 50 }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  sessionDuration: integer('session_duration').default(0), // Seconds on site
  
  // Validation status
  isValidated: boolean('is_validated').default(false).notNull(), // Passed Double-Lock?
  validationFailureReason: varchar('validation_failure_reason', { length: 255 }), // Why it failed
});

// JourneyEvents table - stores per-page visitor actions
export const journeyEvents = pgTable('JourneyEvents', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.tenantId, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  clickLogId: integer('click_log_id').references(() => clickLogs.id, { onDelete: 'cascade' }),
  pageUrl: text('page_url').notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'pageview', 'click', 'success_event'
  eventTarget: text('event_target'), // Button text, link href, etc.
  dwellTime: integer('dwell_time').default(0), // Seconds on this page
  scrollDepth: integer('scroll_depth').default(0), // Percentage scrolled
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  isSuccessEvent: boolean('is_success_event').default(false).notNull(), // tel:, mailto:, form submit
});

// UnregisteredTrafficLog table - logs Double-Lock validation failures
export const unregisteredTrafficLog = pgTable('UnregisteredTrafficLog', {
  id: serial('id').primaryKey(),
  receivedCampaignId: varchar('received_campaign_id', { length: 50 }).notNull(),
  receivedDomain: varchar('received_domain', { length: 255 }),
  receivedUrl: text('received_url'),
  failureReason: varchar('failure_reason', { length: 255 }).notNull(),
  maskedIp: varchar('masked_ip', { length: 50 }),
  loggedAt: timestamp('logged_at').defaultNow().notNull(),
});

// Sessions table - aggregated session metadata
export const sessions = pgTable('Sessions', {
  id: serial('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.tenantId, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
  keyword: varchar('keyword', { length: 500 }),
  campaignId: varchar('campaign_id', { length: 50 }),
  device: varchar('device', { length: 50 }),
  totalDuration: integer('total_duration').default(0), // Total seconds
  pageCount: integer('page_count').default(0),
  hadSuccessEvent: boolean('had_success_event').default(false).notNull(),
  isBounce: boolean('is_bounce').default(false).notNull(), // < 5 seconds
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
