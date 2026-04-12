-- ViralTrim D1 — full schema (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  password_hash TEXT,
  provider TEXT NOT NULL DEFAULT 'email',
  provider_id TEXT,
  stripe_customer_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'agency')),
  clips_used_this_month INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  theme TEXT DEFAULT 'dark',
  is_active INTEGER DEFAULT 1,
  locked_until INTEGER,
  failed_login_attempts INTEGER DEFAULT 0,
  last_active_at INTEGER,
  preferences TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  last_activity INTEGER DEFAULT (unixepoch()),
  is_revoked INTEGER DEFAULT 0,
  revoked_at INTEGER,
  revoked_reason TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,
  stripe_product_id TEXT,
  status TEXT NOT NULL,
  plan_name TEXT,
  plan_interval TEXT,
  current_period_start INTEGER,
  current_period_end INTEGER,
  trial_start INTEGER,
  trial_end INTEGER,
  cancel_at_period_end INTEGER,
  metadata TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL,
  invoice_pdf TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  duration TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  views TEXT,
  engagement TEXT,
  thumbnail TEXT,
  video_url TEXT,
  viral_score INTEGER,
  caption TEXT,
  required_credit TEXT,
  source_url TEXT,
  source_channel TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clip_id TEXT REFERENCES clips(id) ON DELETE SET NULL,
  title TEXT,
  platform TEXT NOT NULL,
  scheduled_for INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  thumbnail TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  meta TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tos_agreements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agreed_at INTEGER NOT NULL,
  ip_address TEXT,
  tos_version TEXT NOT NULL DEFAULT '1.0'
);

CREATE TABLE IF NOT EXISTS dmca_reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  original_work_url TEXT NOT NULL,
  infringing_url TEXT NOT NULL,
  reported_user_id TEXT REFERENCES users(id),
  description TEXT,
  good_faith_statement INTEGER DEFAULT 0,
  accuracy_statement INTEGER DEFAULT 0,
  electronic_signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  stripe_connect_id TEXT,
  total_earned REAL NOT NULL DEFAULT 0,
  pending_payout REAL NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id TEXT PRIMARY KEY NOT NULL,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_converted_to TEXT,
  commission_amount REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  converted_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata TEXT DEFAULT '{}',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_user ON clips(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_user ON scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id);
