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
      startSec?: number;
      endSec?: number;
      captionLines?: string[];
      textStyle?: string;
    },
  ): Promise<{ clip: Clip | null; error?: string }> {
    const isAgency = ["agency", "unlimited"].includes((user.plan ?? "").toLowerCase());
    const maxDuration = isAgency ? 600 : 90;
    if (data.durationSeconds > maxDuration) {
      return { clip: null, error: `Clip exceeds ${maxDuration} second maximum for ${user.plan} tier` };
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
        durationSeconds: Math.round(data.durationSeconds),
        editCount: 0,
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
        startSec: data.startSec,
        endSec: data.endSec,
        captionLines: data.captionLines,
        textStyle: data.textStyle,
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
  async getClipById(clipId: string, userId: string): Promise<Clip | null> {
    const [clip] = await this.db
      .select()
      .from(clips)
      .where(eq(clips.id, clipId));
    if (clip && clip.userId !== userId) {
      return null;
    }
    return clip ?? null;
  }

  async updateClip(
    clipId: string,
    userId: string,
    updates: Partial<Clip>,
    userPlan: string,
  ): Promise<{ clip: Clip | null; error?: string }> {
    const clip = await this.getClipById(clipId, userId);
    if (!clip) {
      return { clip: null, error: "Clip not found" };
    }

    // Spec: Free=1, Pro=3, Agency=10 (soft cap, contact us for more)
    let editLimit = 1;
    if (userPlan === "pro") editLimit = 3;
    if (userPlan === "agency") editLimit = 10;
    if (userPlan === "unlimited") editLimit = 999;

    if ((clip.editCount ?? 0) >= editLimit) {
      return { clip: null, error: `Edit limit reached (${editLimit} max for ${userPlan} tier)` };
    }

    const [updated] = await this.db
      .update(clips)
      .set({
        ...updates,
        editCount: (clip.editCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(clips.id, clipId))
      .returning();

    if (!updated) {
      return { clip: null, error: "Failed to update clip" };
    }

    await this.logActivity(userId, "clip_updated", { clipId });
    return { clip: updated };
  }
}
export function createClipService(db: Database): ClipService {
  return new ClipService(db);
}
