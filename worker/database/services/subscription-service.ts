import { desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Database } from "../index";
import { payments, subscriptions, users, type Subscription } from "../schema";
import { generateId } from "../../auth";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "trialing"
  | "unpaid"
  | "paused";

export type NewSubscription = typeof subscriptions.$inferInsert;

export interface CreateSubscriptionData {
  userId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeProductId?: string;
  status: SubscriptionStatus;
  planName?: string;
  planInterval?: "month" | "year";
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, unknown>;
}

export class SubscriptionService {
  constructor(private db: Database) {}

  async createSubscription(data: CreateSubscriptionData): Promise<Subscription> {
    const [sub] = await this.db
      .insert(subscriptions)
      .values({
        id: generateId(),
        userId: data.userId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripePriceId: data.stripePriceId,
        stripeProductId: data.stripeProductId,
        status: data.status,
        planName: data.planName,
        planInterval: data.planInterval,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        trialStart: data.trialStart,
        trialEnd: data.trialEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        metadata: data.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!sub) {
      throw new Error("Failed to create subscription");
    }
    return sub;
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    return sub ?? null;
  }

  async upsertFromStripeSubscription(
    userId: string,
    stripeSubscription: Stripe.Subscription,
  ): Promise<Subscription> {
    const item = stripeSubscription.items?.data?.[0];
    const price = item?.price;
    const raw = stripeSubscription as unknown as Record<string, unknown>;
    const periodStartSec = raw["current_period_start"];
    const periodEndSec = raw["current_period_end"];
    const trialStartSec = raw["trial_start"];
    const trialEndSec = raw["trial_end"];
    const toDate = (v: unknown): Date | undefined =>
      typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000) : undefined;
    const data: CreateSubscriptionData = {
      userId,
      stripeSubscriptionId: String(stripeSubscription.id),
      stripePriceId: String(price?.id ?? ""),
      stripeProductId: typeof price?.product === "string" ? price.product : String(price?.product ?? ""),
      status: stripeSubscription.status as SubscriptionStatus,
      planName: typeof price?.nickname === "string" ? price.nickname : undefined,
      planInterval: price?.recurring?.interval === "year" ? "year" : "month",
      currentPeriodStart: toDate(periodStartSec),
      currentPeriodEnd: toDate(periodEndSec),
      trialStart: toDate(trialStartSec),
      trialEnd: toDate(trialEndSec),
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      metadata: (stripeSubscription.metadata as Record<string, unknown>) ?? {},
    };

    const existing = await this.findByStripeSubscriptionId(data.stripeSubscriptionId);
    if (existing) {
      const [updated] = await this.db
        .update(subscriptions)
        .set({
          stripePriceId: data.stripePriceId,
          stripeProductId: data.stripeProductId,
          status: data.status,
          planName: data.planName,
          planInterval: data.planInterval,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          trialStart: data.trialStart,
          trialEnd: data.trialEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          metadata: data.metadata,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error("Subscription update failed");
      }
      return updated;
    }
    return this.createSubscription(data);
  }

  async findActiveForUser(userId: string): Promise<Subscription | null> {
    const rows = await this.db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    const active = rows.find(
      (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
    );
    return active ?? null;
  }

  async recordPayment(data: {
    userId: string;
    stripeInvoiceId?: string | null;
    amount: number;
    currency: string;
    status: string;
    invoicePdf?: string | null;
  }): Promise<void> {
    await this.db.insert(payments).values({
      id: generateId(),
      userId: data.userId,
      stripeInvoiceId: data.stripeInvoiceId ?? undefined,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      invoicePdf: data.invoicePdf ?? undefined,
      createdAt: new Date(),
    });
  }

  async listPaymentsForUser(userId: string, limit = 50) {
    return this.db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(limit);
  }
}

export function createSubscriptionService(db: Database): SubscriptionService {
  return new SubscriptionService(db);
}

export function planFromPriceId(
  priceId: string,
  proPriceId: string,
  agencyPriceId: string,
): "free" | "pro" | "agency" {
  if (priceId && priceId === agencyPriceId) {
    return "agency";
  }
  if (priceId && priceId === proPriceId) {
    return "pro";
  }
  return "free";
}

export async function syncUserPlanFromSubscription(
  db: Database,
  userId: string,
  stripeSubscription: Stripe.Subscription,
  proPriceId: string,
  agencyPriceId: string,
): Promise<void> {
  const item = stripeSubscription.items?.data?.[0];
  const priceId = String(item?.price?.id ?? "");
  const active =
    stripeSubscription.status === "active" || stripeSubscription.status === "trialing";
  const plan = active ? planFromPriceId(priceId, proPriceId, agencyPriceId) : "free";
  await db
    .update(users)
    .set({ plan, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
