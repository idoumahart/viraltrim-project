/**
 * ViralTrim Database Schema - Drizzle ORM
 * 
 * Defines the persistent relational structures for the ViralTrim SaaS engine.
 * Ensures consistent typing for production D1 deployment.
 */
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull().unique(),
  username: text('username').unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  provider: text('provider').notNull().default('email'),
  providerId: text('provider_id'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  theme: text('theme', { enum: ['light', 'dark', 'system'] }).default('dark'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
  preferences: text('preferences', { mode: 'json' }).default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  lastActivity: integer('last_activity', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  isRevoked: integer('is_revoked', { mode: 'boolean' }).default(false),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  revokedReason: text('revoked_reason'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),