import { eq, and, sql, gte, count, desc } from 'drizzle-orm';
import type { Database } from '../index';
import { usage_logs, clips, scheduled_posts, subscriptions, type Clip, type NewClip, type Affiliate } from '../schema';
export interface ViralVideo {
    id: string;
    title: string;
    url: string;
    views: string;
    engagement: string;
    viralScore: number;
    category: string;
    thumbnail: string;
    duration: string;
}
export interface ClipSuggestion {
    id: string;
    title: string;
    startTime: string;
    duration: string;
    viralScore: number;
    thumbnail: string;
    concept: string;
}
export interface UsageSummary {
    used: number;
    limit: number;
    remaining: number;
    plan: string;
}
export class ClipService {
    constructor(private db: Database) {}
    async createClip(userId: string, data: Partial<NewClip>): Promise<Clip> {
        const id = crypto.randomUUID();
        const [result] = await this.db.insert(clips).values({
            id,
            userId,
            title: data.title || 'AI Viral Selection',
            platform: data.platform || 'TikTok (9:16)',
            status: 'draft',
            thumbnail: data.thumbnail || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=800',
            duration: data.duration || '0:58',
            createdAt: new Date(),
            updatedAt: new Date(),