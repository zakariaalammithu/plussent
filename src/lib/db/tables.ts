// CREATE TABLE / INDEX statements (shared by scripts/migrate.ts and server startup).
export const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT,
    full_name TEXT,
    email_verified_at INTEGER,
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    is_super_admin INTEGER DEFAULT 0 NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email)`,

  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    plan TEXT DEFAULT 'free' NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_idx ON workspaces (slug)`,

  `CREATE TABLE IF NOT EXISTS workspace_members (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member' NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS wm_unique_idx ON workspace_members (workspace_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS wm_ws_idx ON workspace_members (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    token_hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    workspace_id TEXT,
    user_agent TEXT,
    ip TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token_hash)`,

  `CREATE TABLE IF NOT EXISTS verification_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    ip TEXT,
    success INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email)`,

  `CREATE TABLE IF NOT EXISTS email_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    encrypted_credentials TEXT NOT NULL,
    status TEXT DEFAULT 'disconnected' NOT NULL,
    last_error TEXT,
    daily_limit INTEGER DEFAULT 100 NOT NULL,
    sent_today INTEGER DEFAULT 0 NOT NULL,
    sent_today_date TEXT,
    health_score INTEGER DEFAULT 100 NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ea_ws_idx ON email_accounts (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    spf_ok INTEGER DEFAULT 0 NOT NULL,
    dkim_ok INTEGER DEFAULT 0 NOT NULL,
    dmarc_ok INTEGER DEFAULT 0 NOT NULL,
    mx_ok INTEGER DEFAULT 0 NOT NULL,
    last_checked_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS domains_ws_idx ON domains (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    website TEXT,
    job_title TEXT,
    industry TEXT,
    country TEXT,
    city TEXT,
    linkedin_url TEXT,
    tags TEXT DEFAULT '[]' NOT NULL,
    custom_fields TEXT DEFAULT '{}' NOT NULL,
    verification_status TEXT DEFAULT 'unverified' NOT NULL,
    list_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS leads_ws_email_idx ON leads (workspace_id, email)`,
  `CREATE INDEX IF NOT EXISTS leads_ws_idx ON leads (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS lead_lists (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS lead_lists_ws_idx ON lead_lists (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft' NOT NULL,
    timezone TEXT DEFAULT 'UTC' NOT NULL,
    daily_limit INTEGER DEFAULT 50 NOT NULL,
    tracking_open INTEGER DEFAULT 0 NOT NULL,
    tracking_click INTEGER DEFAULT 1 NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS campaigns_ws_idx ON campaigns (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS sequences (
    id TEXT PRIMARY KEY NOT NULL,
    campaign_id TEXT NOT NULL,
    step INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    delay_days INTEGER DEFAULT 0 NOT NULL,
    delay_minutes INTEGER DEFAULT 0 NOT NULL,
    business_days_only INTEGER DEFAULT 1 NOT NULL,
    variant TEXT DEFAULT 'A' NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sequences_campaign_idx ON sequences (campaign_id)`,

  `CREATE TABLE IF NOT EXISTS campaign_leads (
    id TEXT PRIMARY KEY NOT NULL,
    campaign_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    email_account_id TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    next_step INTEGER DEFAULT 1 NOT NULL,
    next_send_at INTEGER,
    last_sent_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cl_unique_idx ON campaign_leads (campaign_id, lead_id)`,
  `CREATE INDEX IF NOT EXISTS cl_campaign_idx ON campaign_leads (campaign_id)`,

  `CREATE TABLE IF NOT EXISTS email_messages (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    campaign_id TEXT,
    campaign_lead_id TEXT,
    lead_id TEXT,
    email_account_id TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'queued' NOT NULL,
    idempotency_key TEXT NOT NULL,
    error TEXT,
    sent_at INTEGER,
    opened_at INTEGER,
    clicked_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS em_idem_idx ON email_messages (idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS em_ws_idx ON email_messages (workspace_id)`,
  `CREATE INDEX IF NOT EXISTS em_campaign_idx ON email_messages (campaign_id)`,

  `CREATE TABLE IF NOT EXISTS email_events (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    message_id TEXT,
    type TEXT NOT NULL,
    metadata TEXT DEFAULT '{}' NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ee_ws_idx ON email_events (workspace_id)`,
  `CREATE INDEX IF NOT EXISTS ee_msg_idx ON email_events (message_id)`,

  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    lead_id TEXT,
    email_account_id TEXT,
    subject TEXT,
    classification TEXT,
    classification_source TEXT,
    status TEXT DEFAULT 'open' NOT NULL,
    assigned_to TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS conv_ws_idx ON conversations (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS suppressions (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    email TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS supp_ws_email_idx ON suppressions (workspace_id, email)`,

  `CREATE TABLE IF NOT EXISTS warmup_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    email_account_id TEXT NOT NULL,
    status TEXT DEFAULT 'paused' NOT NULL,
    daily_volume INTEGER DEFAULT 10 NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS warmup_ws_idx ON warmup_sessions (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS ai_usage (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    kind TEXT NOT NULL,
    units INTEGER DEFAULT 1 NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ai_ws_idx ON ai_usage (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    plan TEXT DEFAULT 'free' NOT NULL,
    status TEXT DEFAULT 'trialing' NOT NULL,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    current_period_end INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sub_ws_idx ON subscriptions (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS apikey_ws_idx ON api_keys (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_ws_idx ON audit_logs (workspace_id)`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT,
    title TEXT NOT NULL,
    body TEXT,
    read INTEGER DEFAULT 0 NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notif_ws_idx ON notifications (workspace_id)`,
];
