/**
 * ViralTrim D1 schema (Drizzle ORM, SQLite).
 */
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey().notNull(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  displayName: text("display_name").notNull(),
  companyName: text("company_name"),
  phoneNumber: text("phone_number"),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash"),
  provider: text("provider").notNull().default("email"),
  providerId: text("provider_id"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  plan: text("plan", { enum: ["free", "pro", "agency"] }).notNull().default("free"),
  clipsUsedThisMonth: integer("clips_used_this_month").notNull().default(0),
  isBanned: integer("is_banned", { mode: "boolean" }).notNull().default(false),
  theme: text("theme", { enum: ["light", "dark", "system"] }).default("dark"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lastActiveAt: integer("last_active_at", { mode: "timestamp" }),
  preferences: text("preferences", { mode: "json" }).default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  lastActivity: integer("last_activity", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  isRevoked: integer("is_revoked", { mode: "boolean" }).default(false),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  revokedReason: text("revoked_reason"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripePriceId: text("stripe_price_id").notNull(),
  stripeProductId: text("stripe_product_id"),
  status: text("status").notNull(),
  planName: text("plan_name"),
  planInterval: text("plan_interval"),
  currentPeriodStart: integer("current_period_start", { mode: "timestamp" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  trialStart: integer("trial_start", { mode: "timestamp" }),
  trialEnd: integer("trial_end", { mode: "timestamp" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }),
  metadata: text("metadata", { mode: "json" }).default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeInvoiceId: text("stripe_invoice_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull(),
  invoicePdf: text("invoice_pdf"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const clips = sqliteTable("clips", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  platform: text("platform").notNull(),
  duration: text("duration"),
  status: text("status").notNull().default("draft"),
  views: text("views"),
  engagement: text("engagement"),
  thumbnail: text("thumbnail"),
  videoUrl: text("video_url"),
  viralScore: integer("viral_score"),
  caption: text("caption"),
  requiredCredit: text("required_credit"),
  sourceUrl: text("source_url"),
  sourceChannel: text("source_channel"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const scheduledPosts = sqliteTable("scheduled_posts", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clipId: text("clip_id").references(() => clips.id, { onDelete: "set null" }),
  title: text("title"),
  platform: text("platform").notNull(),
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("pending"),
  thumbnail: text("thumbnail"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const usageLogs = sqliteTable("usage_logs", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  meta: text("meta", { mode: "json" }).default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const tosAgreements = sqliteTable("tos_agreements", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agreedAt: integer("agreed_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  tosVersion: text("tos_version").notNull().default("1.0"),
});

export const dmcaReports = sqliteTable("dmca_reports", {
  id: text("id").primaryKey().notNull(),
  reporterName: text("reporter_name").notNull(),
  reporterEmail: text("reporter_email").notNull(),
  originalWorkUrl: text("original_work_url").notNull(),
  infringingUrl: text("infringing_url").notNull(),
  reportedUserId: text("reported_user_id").references(() => users.id),
  description: text("description"),
  goodFaithStatement: integer("good_faith_statement", { mode: "boolean" }).default(false),
  accuracyStatement: integer("accuracy_statement", { mode: "boolean" }).default(false),
  electronicSignature: text("electronic_signature").notNull(),
  status: text("status").notNull().default("pending"),
  submittedAt: integer("submitted_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const affiliates = sqliteTable("affiliates", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  referralCode: text("referral_code").notNull().unique(),
  stripeConnectId: text("stripe_connect_id"),
  totalEarned: real("total_earned").notNull().default(0),
  pendingPayout: real("pending_payout").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const affiliateReferrals = sqliteTable("affiliate_referrals", {
  id: text("id").primaryKey().notNull(),
  affiliateId: text("affiliate_id")
    .notNull()
    .references(() => affiliates.id, { onDelete: "cascade" }),
  referredUserId: text("referred_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planConvertedTo: text("plan_converted_to"),
  commissionAmount: real("commission_amount"),
  status: text("status").notNull().default("pending"),
  convertedAt: integer("converted_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  metadata: text("metadata", { mode: "json" }).default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const processedWebhookEvents = sqliteTable("processed_webhook_events", {
  id: text("id").primaryKey().notNull(),
  eventId: text("event_id").notNull().unique(),
  processedAt: integer("processed_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
