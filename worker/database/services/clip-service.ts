import { desc, eq } from "drizzle-orm";
import type { Database } from "../index";
import { clips, scheduledPosts, usageLogs, users, type Clip, type User } from "../schema";
import { generateId } from "../../auth";

export interface UsageSummary {
  used: number;
  limit: number;
  remaining: number;
  plan: string;
}

export function clipQuotaForPlan(plan: string): number {
  if (plan === "agency") {
    return 999_999;
  }
  if (plan === "pro") {
    return 50;
  }
  return 3;
}

export class ClipService {
  constructor(private db: Database) {}

  async getUsageSummary(user: User): Promise<UsageSummary> {
    const limit = clipQuotaForPlan(user.plan);
    const used = user.clipsUsedThisMonth ?? 0;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      plan: user.plan,
    };
  }

  async listClips(userId: string): Promise<Clip[]> {
    return this.db
      .select()
      .from(clips)
      .where(eq(clips.userId, userId))
      .orderBy(desc(clips.createdAt));
  }

  async listScheduled(userId: string) {
    return this.db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.userId, userId))
      .orderBy(desc(scheduledPosts.scheduledFor));
  }

  async logActivity(userId: string, action: string, meta?: Record<string, unknown>): Promise<void> {
    await this.db.insert(usageLogs).values({
      id: generateId(),
      userId,
      action,
      meta: meta ?? {},
      createdAt: new Date(),
    });
  }

  async listRecentActivity(userId: string, limit = 20) {
    return this.db
      .select()
      .from(usageLogs)
      .where(eq(usageLogs.userId, userId))
      .orderBy(desc(usageLogs.createdAt))
      .limit(limit);
  }

  async createGeneratedClip(
    user: User,
    data: {
      title: string;
      platform: string;
      durationSeconds: number;
      caption: string;
      requiredCredit: string;
      viralScore: number;
      sourceUrl: string;
      sourceChannel: string;
      thumbnail?: string | null;
      videoUrl?: string | null;
    },
  ): Promise<{ clip: Clip | null; error?: string }> {
    if (data.durationSeconds > 90) {
      return { clip: null, error: "Clip exceeds 90 second maximum" };
    }
    const limit = clipQuotaForPlan(user.plan);
    if ((user.clipsUsedThisMonth ?? 0) >= limit) {
      return { clip: null, error: "Monthly clip quota exceeded" };
    }
    const fullCaption = `${data.caption.trim()}\n\nOriginal video by ${data.sourceChannel}`;
    const id = generateId();
    const [clip] = await this.db
      .insert(clips)
      .values({
        id,
        userId: user.id,
        title: data.title,
        platform: data.platform,
        duration: `${Math.round(data.durationSeconds)}s`,
        status: "draft",
        views: "—",
        engagement: "—",
        thumbnail: data.thumbnail ?? null,
        videoUrl: data.videoUrl ?? data.sourceUrl,
        viralScore: data.viralScore,
        caption: fullCaption,
        requiredCredit: data.requiredCredit,
        sourceUrl: data.sourceUrl,
        sourceChannel: data.sourceChannel,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!clip) {
      return { clip: null, error: "Failed to save clip" };
    }
    await this.db
      .update(users)
      .set({
        clipsUsedThisMonth: (user.clipsUsedThisMonth ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await this.logActivity(user.id, "clip_generated", { clipId: clip.id });
    return { clip };
  }
}

export function createClipService(db: Database): ClipService {
  return new ClipService(db);
}
