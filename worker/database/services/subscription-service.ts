import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../index';
import { subscriptions, payments, type Subscription, type Payment } from '../schema';
export type SubscriptionStatus = 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'unpaid' | 'paused';
export type NewSubscription = typeof subscriptions.$inferInsert;
export interface CreateSubscriptionData {
    userId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    stripeProductId?: string;
    status: SubscriptionStatus;
    planName?: string;
    planInterval?: 'month' | 'year';
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    trialStart?: Date;
    trialEnd?: Date;
    metadata?: Record<string, unknown>;
}
export class SubscriptionService {
    constructor(private db: Database) {}
    async createSubscription(data: CreateSubscriptionData): Promise<Subscription> {
        const [sub] = await this.db.insert(subscriptions).values({
            id: crypto.randomUUID(),
            ...data,
            metadata: data.metadata || {},
        }).returning();
        return sub;
    }
    async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
        const [sub] = await this.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId)).limit(1);
        return sub || null;
    }
    async upsertSubscription(userId: string, stripeSubscription: any): Promise<Subscription> {
        const existing = await this.findByStripeSubscriptionId(stripeSubscription.id);
        // Safety checks for Stripe object structure
        const item = stripeSubscription.items?.data?.[0];
        const price = item?.price;
        const data = {
            userId,
            stripeSubscriptionId: String(stripeSubscription.id),
            stripePriceId: String(price?.id || ''),
            stripeProductId: String(price?.product || ''),