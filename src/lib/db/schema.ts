// PlusSent DB schema — Drizzle + libSQL (SQLite). Tenant = workspace.
// Every tenant-scoped table carries workspaceId; queries MUST filter by it (see lib/tenant.ts).
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  fullName: text("full_name"),
  emailVerifiedAt: integer("email_verified_at"),
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled").default(0).notNull(),
  status: text("status").default("active").notNull(), // active | suspended
  isSuperAdmin: integer("is_super_admin").default(0).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ownerId: text("owner_id").notNull(),
  plan: text("plan").default("free").notNull(), // free | starter | growth | agency | enterprise
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [uniqueIndex("workspaces_slug_idx").on(t.slug)]);

export const workspaceMembers = sqliteTable("workspace_members", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").default("member").notNull(), // owner | admin | member | viewer
  createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("wm_unique_idx").on(t.workspaceId, t.userId), index("wm_ws_idx").on(t.workspaceId)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // opaque token id; token = id + secret hash stored separately is overkill — token itself is random 32B, stored hashed
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id"),
  userAgent: text("user_agent"),
  ip: text("ip"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_token_idx").on(t.tokenHash)]);

export const verificationTokens = sqliteTable("verification_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(), // email_verify | password_reset
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  ip: text("ip"),
  success: integer("success").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("login_attempts_email_idx").on(t.email)]);

export const emailAccounts = sqliteTable("email_accounts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  provider: text("provider").notNull(), // gmail | outlook | smtp
  email: text("email").notNull(),
  displayName: text("display_name"),
  encryptedCredentials: text("encrypted_credentials").notNull(), // AES-256-GCM JSON, never plaintext
  status: text("status").default("disconnected").notNull(), // connected | disconnected | error
  lastError: text("last_error"),
  dailyLimit: integer("daily_limit").default(100).notNull(),
  sentToday: integer("sent_today").default(0).notNull(),
  sentTodayDate: text("sent_today_date"),
  healthScore: integer("health_score").default(100).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("ea_ws_idx").on(t.workspaceId)]);

export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  domain: text("domain").notNull(),
  spfOk: integer("spf_ok").default(0).notNull(),
  dkimOk: integer("dkim_ok").default(0).notNull(),
  dmarcOk: integer("dmarc_ok").default(0).notNull(),
  mxOk: integer("mx_ok").default(0).notNull(),
  lastCheckedAt: integer("last_checked_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("domains_ws_idx").on(t.workspaceId)]);

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  website: text("website"),
  jobTitle: text("job_title"),
  industry: text("industry"),
  country: text("country"),
  city: text("city"),
  linkedinUrl: text("linkedin_url"),
  tags: text("tags").default("[]").notNull(), // JSON array
  customFields: text("custom_fields").default("{}").notNull(), // JSON object
  verificationStatus: text("verification_status").default("unverified").notNull(), // unverified | valid | invalid | risky | disposable
  listId: text("list_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [uniqueIndex("leads_ws_email_idx").on(t.workspaceId, t.email), index("leads_ws_idx").on(t.workspaceId)]);

export const leadLists = sqliteTable("lead_lists", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("lead_lists_ws_idx").on(t.workspaceId)]);

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  status: text("status").default("draft").notNull(), // draft | active | paused | stopped | archived
  timezone: text("timezone").default("UTC").notNull(),
  dailyLimit: integer("daily_limit").default(50).notNull(),
  trackingOpen: integer("tracking_open").default(0).notNull(),
  trackingClick: integer("tracking_click").default(1).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("campaigns_ws_idx").on(t.workspaceId)]);

export const sequences = sqliteTable("sequences", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  step: integer("step").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  delayDays: integer("delay_days").default(0).notNull(),
  delayMinutes: integer("delay_minutes").default(0).notNull(),
  businessDaysOnly: integer("business_days_only").default(1).notNull(),
  variant: text("variant").default("A").notNull(),
}, (t) => [index("sequences_campaign_idx").on(t.campaignId)]);

export const campaignLeads = sqliteTable("campaign_leads", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  leadId: text("lead_id").notNull(),
  emailAccountId: text("email_account_id"),
  status: text("status").default("pending").notNull(), // pending | queued | sent | replied | bounced | unsubscribed | stopped | completed
  nextStep: integer("next_step").default(1).notNull(),
  nextSendAt: integer("next_send_at"),
  lastSentAt: integer("last_sent_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("cl_unique_idx").on(t.campaignId, t.leadId), index("cl_campaign_idx").on(t.campaignId)]);

export const emailMessages = sqliteTable("email_messages", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  campaignId: text("campaign_id"),
  campaignLeadId: text("campaign_lead_id"),
  leadId: text("lead_id"),
  emailAccountId: text("email_account_id"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").default("queued").notNull(), // queued | sent | delivered | opened | clicked | replied | bounced | failed
  idempotencyKey: text("idempotency_key").notNull(),
  error: text("error"),
  sentAt: integer("sent_at"),
  openedAt: integer("opened_at"),
  clickedAt: integer("clicked_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("em_idem_idx").on(t.idempotencyKey), index("em_ws_idx").on(t.workspaceId), index("em_campaign_idx").on(t.campaignId)]);

export const emailEvents = sqliteTable("email_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  messageId: text("message_id"),
  type: text("type").notNull(), // sent | delivered | opened | clicked | replied | bounced | unsubscribed | complained
  metadata: text("metadata").default("{}").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("ee_ws_idx").on(t.workspaceId), index("ee_msg_idx").on(t.messageId)]);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  leadId: text("lead_id"),
  emailAccountId: text("email_account_id"),
  subject: text("subject"),
  classification: text("classification"), // interested | positive | meeting_request | question | not_interested | unsubscribe | out_of_office | wrong_person | referral | negative | other
  classificationSource: text("classification_source"), // heuristic | ai
  status: text("status").default("open").notNull(), // open | starred | archived | assigned
  assignedTo: text("assigned_to"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("conv_ws_idx").on(t.workspaceId)]);

export const suppressions = sqliteTable("suppressions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  reason: text("reason").notNull(), // unsubscribed | bounced | complained | manual
  createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("supp_ws_email_idx").on(t.workspaceId, t.email)]);

export const warmupSessions = sqliteTable("warmup_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  emailAccountId: text("email_account_id").notNull(),
  status: text("status").default("paused").notNull(), // active | paused
  dailyVolume: integer("daily_volume").default(10).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("warmup_ws_idx").on(t.workspaceId)]);

export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(), // muse | openai | anthropic | heuristic
  kind: text("kind").notNull(), // email_write | personalization | reply_classify | assistant
  units: integer("units").default(1).notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("ai_ws_idx").on(t.workspaceId)]);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  plan: text("plan").default("free").notNull(),
  status: text("status").default("trialing").notNull(), // trialing | active | past_due | canceled
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: integer("current_period_end"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("sub_ws_idx").on(t.workspaceId)]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("apikey_ws_idx").on(t.workspaceId)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("audit_ws_idx").on(t.workspaceId)]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id"),
  title: text("title").notNull(),
  body: text("body"),
  read: integer("read").default(0).notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("notif_ws_idx").on(t.workspaceId)]);
