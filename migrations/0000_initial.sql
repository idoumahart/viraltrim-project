-- Initial Schema for ViralTrim D1 Database
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    password_hash TEXT,
    provider TEXT NOT NULL DEFAULT 'email',
    provider_id TEXT,
    stripe_customer_id TEXT UNIQUE,
    theme TEXT DEFAULT 'dark',
    is_active INTEGER DEFAULT 1,
    locked_until INTEGER,
    failed_login_attempts INTEGER DEFAULT 0,
    last_active_at INTEGER,
    preferences TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
    updated_at INTEGER DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    last_activity INTEGER DEFAULT CURRENT_TIMESTAMP,
    is_revoked INTEGER DEFAULT 0,
    revoked_at INTEGER,
    revoked_reason TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    stripe_price_id TEXT NOT NULL,
    stripe_product_id TEXT,
    status TEXT NOT NULL,
    plan_name TEXT,
    plan_interval TEXT,
    current_period_start INTEGER,