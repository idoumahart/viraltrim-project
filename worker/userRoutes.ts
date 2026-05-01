import type Stripe from "stripe";
import { Context, Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, count, eq, or } from "drizzle-orm";
import { createSession, extractBearerToken, generateId, revokeSession, validateSession, validateApiKey } from "./auth";
import { createDatabase, type Database } from "./database";
import { affiliateReferrals, affiliates, apiKeys, clips, dmcaReports, users, processedWebhookEvents, importedLinks, sessions, renderJobs } from "./database/schema";
import { createClipService } from "./database/services/clip-service";
import { createSubscriptionService, syncUserPlanFromSubscription } from "./database/services/subscription-service";
import { createUserService } from "./database/services/user-service";
import type { Env } from "./core-utils";
import { dmcaAdminHtml, sendResendEmail, welcomeEmailHtml, verifyEmailHtml } from "./email";
import { chatbotReply, fetchYouTubeVideos, fetchRedditVideos, fetchRapidApiVideos, generateClipMetadata, generateHookSuggestions } from "./gemini";
import { checkChatbotRateLimit, checkAuthRateLimit, checkApiRateLimit } from "./rate-limit";
import {
  createCheckoutSession,
  createPortalSession,
  getOrCreateStripeCustomer,
  getStripe,
  listPricesAndProducts,
  verifyWebhookSignature,
  WEBHOOK_EVENTS,
} from "./stripe";
import type { AppEnv } from "./types/app-env";
import { fetchYoutubeTranscript, extractYoutubeId as extractYtId } from "./lib/youtube-transcript";
import { getYoutubeStreamUrls } from "./lib/youtube-stream";
import { registerAiVideoRoutes } from "./aiVideoRoutes";

function publicUser(u: {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  stripeCustomerId: string | null;
  plan: string;
  isEmailVerified?: boolean;
  isOwner?: number | boolean | null;
}) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    stripeCustomerId: u.stripeCustomerId,
    plan: u.plan,
    isEmailVerified: u.isEmailVerified ?? false,
    isOwner: u.isOwner === 1 || u.isOwner === true,
  };
}


/**
 * Queue a clip render job in the background.
 * Returns the jobId immediately; rendering happens async via waitUntil.
 */
async function queueClipRender(
  db: Database,
  clipId: string,
  userId: string,
  env: Env,
  executionCtx: { waitUntil?: (promise: Promise<any>) => void } | undefined,
  options?: { isPreview?: boolean },
): Promise<string> {
  const jobId = generateId();
  await db.insert(renderJobs).values({
    id: jobId,
    clipId,
    userId,
    status: "pending",
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const runRender = async () => {
    let lastErr: string | null = null;
    const secret = env.INTERNAL_WEBHOOK_SECRET;

    // Pre-fetch YouTube stream URL from Worker (bypasses Cloud Run IP blocks)
    let streamUrl: string | undefined;
    const ytIdForRender = extractYtId(
      (await db.select().from(clips).where(eq(clips.id, clipId)).limit(1))[0]?.sourceUrl ?? ""
    );
    if (ytIdForRender) {
      const streamInfo = await getYoutubeStreamUrls(ytIdForRender);
      if (streamInfo) {
        streamUrl = streamInfo.videoUrl;
        console.log(`[render:bg] Pre-fetched stream URL for ${ytIdForRender}`);
      }
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await db.update(renderJobs).set({ attempts: attempt, updatedAt: new Date() }).where(eq(renderJobs.id, jobId));

        const [freshClip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
        if (!freshClip) {
          lastErr = "Clip deleted during render";
          break;
        }

        let cropCenterX: number | undefined;
        if (env.VISION_URL) {
          try {
            const visionResp = await fetch(`${env.VISION_URL}/track`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(secret ? { "X-Internal-Secret": secret } : {}),
              },
              body: JSON.stringify({
                url: freshClip.sourceUrl ?? freshClip.videoUrl,
                start_time: freshClip.startSec ?? 0,
                end_time: freshClip.endSec ?? 30,
                stream_url: streamUrl,
              }),
              signal: AbortSignal.timeout(300000),
            });
            if (visionResp.ok) {
              const visionData = await visionResp.json() as any;
              if (visionData.crop_center_x !== undefined) {
                cropCenterX = visionData.crop_center_x;
              }
            }
          } catch (e) {
            console.error("[render:bg] Vision error:", e);
          }
        }

        const renderResp = await fetch(`${env.RENDERER_URL}/render`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secret ? { "X-Internal-Secret": secret } : {}),
          },
          body: JSON.stringify({
            url: freshClip.sourceUrl ?? freshClip.videoUrl,
            start_time: freshClip.startSec ?? 0,
            end_time: freshClip.endSec ?? 30,
            crop_center_x: cropCenterX,
            aspect_ratio: freshClip.aspectRatio || "9/16",
            stream_url: streamUrl,
          }),
          signal: AbortSignal.timeout(300000),
        });

        if (!renderResp.ok) {
          const errText = await renderResp.text();
          lastErr = `Renderer HTTP ${renderResp.status}: ${errText}`;
          console.error(`[render:bg] attempt ${attempt} failed:`, lastErr);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        const data = await renderResp.json() as any;
        if (data.success && data.url) {
          const clipUpdate: Record<string, unknown> = { videoUrl: data.url, updatedAt: new Date() };
          if (!options?.isPreview) {
            clipUpdate.status = "ready";
          }
          await db.update(clips).set(clipUpdate).where(eq(clips.id, clipId));
          await db.update(renderJobs).set({ status: "ready", videoUrl: data.url, updatedAt: new Date() }).where(eq(renderJobs.id, jobId));
          console.log(`[render:bg] job ${jobId} completed`);
          return;
        } else {
          lastErr = data.error || "Renderer returned no URL";
          console.error(`[render:bg] attempt ${attempt} bad response:`, lastErr);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      } catch (e: any) {
        lastErr = e?.message || String(e);
        console.error(`[render:bg] attempt ${attempt} exception:`, lastErr);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    await db.update(renderJobs).set({ status: "failed", error: lastErr || "All render attempts failed", updatedAt: new Date() }).where(eq(renderJobs.id, jobId));
  };

  executionCtx?.waitUntil?.(runRender());
  return jobId;
}

function sessionTtlSeconds(env: Env): number {
  const n = Number.parseInt(String(env.SESSION_TTL || "604800"), 10);
  return Number.isFinite(n) && n > 0 ? n : 604800;
}

function jwtSecret(env: Env, _req: Request): string {
  const s = String(env.JWT_SECRET || "").trim();
  return s;
}

export const authMiddleware = async (c: Context<AppEnv>, next: () => Promise<void>) => {
  const cookieToken = getCookie(c, "vt_session");
  const bearerToken = extractBearerToken(c.req.raw);
  const token = cookieToken || bearerToken;

  if (!token) {
    return c.json({ success: false, error: "Authorization required" }, 401);
  }

  const db = createDatabase(c.env.DB);

  try {
    // ── Path 1: JWT session (browser / cookie auth) ────────────────────────────
    const secret = jwtSecret(c.env, c.req.raw);
    if (secret) {
      const result = await validateSession(db, token, secret);
      if (result) {
        c.set("user", result.user);
        c.set("token", token);
        return await next();
      }
    }

    // ── Path 2: API key (Bearer token for mobile apps / developer API) ─────────
    if (bearerToken) {
      const apiKeyResult = await validateApiKey(db, bearerToken);
      if (apiKeyResult) {
        c.set("user", apiKeyResult.user);
        c.set("token", bearerToken);
        return await next();
      }
    }

    return c.json({ success: false, error: "Invalid or expired session" }, 401);
  } catch (error) {
    console.error("[AUTH MIDDLEWARE]", error);
    return c.json({ success: false, error: "Identity verification failed" }, 500);
  }
};

export function userRoutes(app: Hono<{ Bindings: Env }>) {
  const api = app as unknown as Hono<AppEnv>;

  api.post("/api/auth/register", async (c) => {
    try {
      const ip =
        c.req.raw.headers.get("cf-connecting-ip") ||
        c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const ok = await checkAuthRateLimit(c.env.CACHE, ip);
      if (!ok) return c.json({ success: false, error: "Too many attempts, please try again later" }, 429);
      const secret = jwtSecret(c.env, c.req.raw);
      if (!secret) {
        return c.json({ success: false, error: "Server misconfigured" }, 500);
      }
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const db = createDatabase(c.env.DB);
      const userService = createUserService(db);
      const { user, error } = await userService.register({
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
        displayName: body.displayName ? String(body.displayName) : undefined,
        companyName: body.companyName ? String(body.companyName) : undefined,
        phoneNumber: body.phoneNumber ? String(body.phoneNumber) : undefined,
        agreeToTerms: body.agreeToTerms === true || body.agreeToTerms === "true",
        referralCode: body.referralCode ? String(body.referralCode) : undefined,
        ipAddress:
          c.req.raw.headers.get("cf-connecting-ip") ??
          c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null,
      });
      if (error || !user) {
        return c.json({ success: false, error: error || "Registration failed" }, 400);
      }
      const ttl = sessionTtlSeconds(c.env);
      const { token } = await createSession(db, user.id, c.req.raw, secret, ttl);
      setCookie(c, "vt_session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: ttl,
      });
      const vToken = await userService.createVerificationToken(user.id);
      const verifyUrl = `${c.env.APP_URL || "http://localhost:3000"}/verify-email?token=${vToken}`;

      const welcome = sendResendEmail(
        c.env,
        user.email,
        "Verify your email - viraltrim",
        verifyEmailHtml(user.displayName, verifyUrl),
      );
      c.executionCtx?.waitUntil(welcome.then(() => undefined));
      return c.json({ success: true, data: { user: publicUser(user), token } });
    } catch (error) {
      console.error("[API] Register", error);
      return c.json({ success: false, error: "System error" }, 500);
    }
  });

  api.post("/api/auth/verify-email", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { token?: string };
      if (!body.token) {
        return c.json({ success: false, error: "Token is required" }, 400);
      }
      const db = createDatabase(c.env.DB);
      const userService = createUserService(db);
      
      const ok = await userService.verifyEmailToken(body.token);
      if (!ok) {
        return c.json({ success: false, error: "Invalid or expired token" }, 400);
      }
      return c.json({ success: true });
    } catch (error) {
      console.error("[API] Verify Email", error);
      return c.json({ success: false, error: "System error" }, 500);
    }
  });

  api.post("/api/auth/resend-verification", authMiddleware, async (c) => {
    try {
      const user = c.get("user");
      // Double check just in case
      if (user.isEmailVerified) {
        return c.json({ success: false, error: "Already verified" }, 400);
      }
      const db = createDatabase(c.env.DB);
      const userService = createUserService(db);
      
      // We don't bother strictly rate limiting this custom route initially, but standard CF protections apply
      const vToken = await userService.createVerificationToken(user.id);
      const verifyUrl = `${c.env.APP_URL || "http://localhost:3000"}/verify-email?token=${vToken}`;
      
      const welcome = sendResendEmail(
        c.env,
        user.email,
        "Verify your email - viraltrim",
        verifyEmailHtml(user.displayName, verifyUrl),
      );
      c.executionCtx?.waitUntil(welcome.then(() => undefined));
      
      return c.json({ success: true });
    } catch (error) {
      console.error("[API] Resend Verification", error);
      return c.json({ success: false, error: "System error" }, 500);
    }
  });

  api.post("/api/auth/login", async (c) => {
    try {
      const ip =
        c.req.raw.headers.get("cf-connecting-ip") ||
        c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const ok = await checkAuthRateLimit(c.env.CACHE, ip);
      if (!ok) return c.json({ success: false, error: "Too many attempts, please try again later" }, 429);
      const secret = jwtSecret(c.env, c.req.raw);
      if (!secret) {
        return c.json({ success: false, error: "Server misconfigured" }, 500);
      }
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const db = createDatabase(c.env.DB);
      const userService = createUserService(db);
      const { user, error } = await userService.login({
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
      });
      if (error || !user) {
        return c.json({ success: false, error: error || "Login failed" }, 401);
      }
      const ttl = sessionTtlSeconds(c.env);
      const { token } = await createSession(db, user.id, c.req.raw, secret, ttl);
      setCookie(c, "vt_session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: ttl,
      });
      return c.json({ success: true, data: { user: publicUser(user), token } });
    } catch (error) {
      console.error("[API] Login", error);
      return c.json({ success: false, error: "System error" }, 500);
    }
  });

  api.post("/api/auth/logout", authMiddleware, async (c) => {
    const secret = jwtSecret(c.env, c.req.raw);
    if (!secret) {
      return c.json({ success: false, error: "Server misconfigured" }, 500);
    }
    const db = createDatabase(c.env.DB);
    const token = getCookie(c, "vt_session") || c.get("token");
    if (token) await revokeSession(db, token, secret);
    deleteCookie(c, "vt_session", { path: "/" });
    return c.json({ success: true });
  });

  api.get("/api/auth/me", authMiddleware, async (c) => {
    return c.json({ success: true, data: publicUser(c.get("user")) });
  });

  api.patch("/api/auth/profile", authMiddleware, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = createDatabase(c.env.DB);
    const userService = createUserService(db);
    const patch: { displayName?: string; avatarUrl?: string | null } = {};
    if (typeof body.displayName === "string") {
      patch.displayName = body.displayName;
    }
    if (typeof body.avatarUrl === "string" || body.avatarUrl === null) {
      patch.avatarUrl = body.avatarUrl as string | null;
    }
    const { user, error } = await userService.updateProfile(c.get("user").id, patch);
    if (error || !user) {
      return c.json({ success: false, error: error || "Update failed" }, 400);
    }
    return c.json({ success: true, data: publicUser(user) });
  });

  api.post("/api/uploads/avatar", authMiddleware, async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ success: false, error: "file required" }, 400);
    }
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedMimeTypes.includes(file.type)) {
      return c.json({ success: false, error: "Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed." }, 400);
    }
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ success: false, error: "File too large (max 5MB)" }, 400);
    }
    const user = c.get("user");
    const key = `avatars/${user.id}/${generateId()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
    const buf = await file.arrayBuffer();
    await c.env.MEDIA.put(key, buf, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    const r2PublicBase = c.env.R2_PUBLIC_URL || "https://media.viraltrim.com";
    const url = `${r2PublicBase}/${key}`;
    const db = createDatabase(c.env.DB);
    await createUserService(db).setAvatarUrl(user.id, url);
    return c.json({ success: true, data: { url, key } });
  });

  /**
   * Upload a video file directly to R2.
   * Returns the R2 key and public URL for the uploaded file.
   */
  api.post("/api/uploads/video", authMiddleware, async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ success: false, error: "file required" }, 400);
    }

    // Validate video file type
    const allowedMimeTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
    if (!allowedMimeTypes.includes(file.type)) {
      return c.json({ success: false, error: "Invalid file type. Only MP4, WebM, MOV, and MKV are allowed." }, 400);
    }

    // Max 2GB for video uploads
    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return c.json({ success: false, error: "File too large (max 2GB)" }, 400);
    }

    const user = c.get("user");
    const id = generateId();
    const ext = file.name.split(".").pop() || "mp4";
    const key = `uploads/${user.id}/${id}.${ext}`;

    try {
      const buf = await file.arrayBuffer();
      await c.env.MEDIA.put(key, buf, {
        httpMetadata: { contentType: file.type || "video/mp4" },
      });

      const r2PublicBase = c.env.R2_PUBLIC_URL || "https://media.viraltrim.com";
      const url = `${r2PublicBase}/${key}`;

      // Create an importedLinks record so the upload appears in My Videos
      const db = createDatabase(c.env.DB);
      await db.insert(importedLinks).values({
        id,
        userId: user.id,
        url,
        platform: "upload",
        title: file.name,
        transcript: null,
        segments: null,
        thumbnail: null,
        videoFileUrl: key,
        sourceType: "upload",
      });

      return c.json({ success: true, data: { id, url, key, title: file.name } });
    } catch (e: any) {
      console.error("[upload:video] Failed:", e);
      return c.json({ success: false, error: "Upload failed: " + (e?.message || String(e)) }, 500);
    }
  });

  /**
   * Upload a rendered clip video directly to R2.
   * Updates the clip's videoUrl with the rendered result.
   */
  api.post("/api/clips/:id/upload-render", authMiddleware, async (c) => {
    const clipId = (c.req.param("id") as string);
    const user = c.get("user");
    const db = createDatabase(c.env.DB);

    // Verify clip ownership
    const clipSvc = createClipService(db);
    const clip = await clipSvc.getClipById(clipId, user.id);
    if (!clip) {
      return c.json({ success: false, error: "Clip not found" }, 404);
    }

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ success: false, error: "file required" }, 400);
    }

    if (!file.type.startsWith("video/")) {
      return c.json({ success: false, error: "Video file required" }, 400);
    }

    // Max 200MB for rendered clips
    const MAX_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return c.json({ success: false, error: "File too large (max 200MB)" }, 400);
    }

    try {
      const id = generateId();
      const ext = file.name.split(".").pop() || "mp4";
      const key = `renders/${user.id}/${id}.${ext}`;

      const buf = await file.arrayBuffer();
      await c.env.MEDIA.put(key, buf, {
        httpMetadata: { contentType: file.type || "video/mp4" },
      });

      const r2PublicBase = c.env.R2_PUBLIC_URL || "https://media.viraltrim.com";
      const url = `${r2PublicBase}/${key}`;

      // Update clip with rendered URL
      await clipSvc.updateClip(clipId, user.id, {
        videoUrl: url,
        status: "ready",
      } as any, user.plan);

      return c.json({ success: true, data: { url, key } });
    } catch (e: any) {
      console.error("[upload:render] Failed:", e);
      return c.json({ success: false, error: "Upload failed: " + (e?.message || String(e)) }, 500);
    }
  });

  api.get("/api/media/*", async (c) => {
    const key = c.req.path.replace(/^\/api\/media\/?/, "");
    if (!key) {
      return c.text("Not found", 404);
    }
    // Redirect to public R2 URL to save Worker CPU/bandwidth
    const r2PublicBase = c.env.R2_PUBLIC_URL || "https://media.viraltrim.com";
    return c.redirect(`${r2PublicBase}/${decodeURIComponent(key)}`, 302);
  });

  api.get("/api/viral-discovery", authMiddleware, async (c) => {
    const youtubeKey = c.env.YOUTUBE_API_KEY as string | undefined;
    const rapidKey = c.env.RAPID_API_KEY as string | undefined;
    const category = (c.req.query("category") || "").slice(0, 100).replace(/[\n\r`]/g, "");
    const platform = (c.req.query("platform") || "all").toLowerCase();

    if (!category.trim()) {
      return c.json({ success: false, error: "Search query required" }, 400);
    }

    try {
      let results: import("./gemini").ViralVideoResult[] = [];

      if (platform === "youtube" || platform === "all") {
        if (!youtubeKey) return c.json({ success: false, error: "YouTube API not configured" }, 503);
        try {
          const yt = await fetchYouTubeVideos(category, youtubeKey);
          results = results.concat(yt);
        } catch (e) {
          console.error("[viral-discovery] YouTube fetch failed:", e);
          // Don't fail the whole request — continue with other sources
        }
      }

      if (platform === "reddit" || platform === "all") {
        try {
          const reddit = await fetchRedditVideos(category);
          results = results.concat(reddit);
        } catch {
          // Reddit is optional — don't fail the whole request
        }
      }

      if (
        platform !== "youtube" &&
        platform !== "reddit" &&
        platform !== "all" &&
        rapidKey
      ) {
        // Specific platform requested (tiktok, instagram, x, facebook, etc.)
        const rapid = await fetchRapidApiVideos(category, platform, rapidKey);
        results = results.concat(rapid);
      } else if (platform === "all" && rapidKey) {
        // "all" also includes trending RapidAPI results
        try {
          const rapid = await fetchRapidApiVideos(category, "trending", rapidKey);
          results = results.concat(rapid);
        } catch {
          // RapidAPI is supplemental — don't fail
        }
      }

      if (!results.length) {
        return c.json({ success: true, data: [] });
      }

      return c.json({ success: true, data: results });
    } catch (e) {
      console.error("[viral-discovery]", e);
      return c.json({ success: false, error: "Discovery failed" }, 502);
    }
  });

  api.post("/api/clips/generate", authMiddleware, async (c) => {
    const ip = c.req.raw.headers.get("cf-connecting-ip") || c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ok = await checkApiRateLimit(c.env.CACHE, ip);
    if (!ok) return c.json({ success: false, error: "Too many requests, slow down." }, 429);

    const key = c.env.GEMINI_API_KEY;
    if (!key) {
      return c.json({ success: false, error: "AI not configured" }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceUrl = String(body.source_url ?? body.sourceUrl ?? "");
    const sourceChannel = String(body.source_channel ?? body.sourceChannel ?? "Unknown channel");
    const start = Number(body.requested_start_seconds ?? body.startSec ?? 0);
    const end = Number(body.requested_end_seconds ?? body.endSec ?? 0);
    const duration = end - start;
    if (!sourceUrl || duration <= 0) {
      return c.json({ success: false, error: "Invalid clip range" }, 400);
    }

    const db = createDatabase(c.env.DB);
    const clipService = createClipService(db);
    const user = c.get("user");
    const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!fresh) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    if (duration > 600) {
      return c.json({ success: false, error: "Clip exceeds maximum allowed length" }, 400);
    }
    if (duration > 90 && fresh.plan !== "agency") {
      return c.json({ success: false, error: "Clips longer than 90 seconds require Agency tier" }, 403);
    }

    // Run synchronously so the caller gets the created clip back
    try {
      const passedCaption = body.caption ? String(body.caption) : null;
      const passedTitle = body.title ? String(body.title) : null;
      const passedScore = body.viralScore ? Number(body.viralScore) : 0;

      // ── Transcript lookup for AI analysis ──────────
      const [link] = await db
        .select()
        .from(importedLinks)
        .where(eq(importedLinks.url, sourceUrl))
        .limit(1);

      let ai;
      if (passedCaption && passedCaption !== "") {
        ai = {
          caption: passedCaption,
          hashtags: passedTitle ? [passedTitle] : [],
          viral_score: passedScore,
        };
      } else {
        ai = await generateClipMetadata(key, c.env.GEMINI_MODEL, {
          sourceUrl,
          sourceChannel,
          startSec: start,
          endSec: end,
          transcript: link?.transcript || undefined
        });
      }
      const credit = `Original video by ${sourceChannel}`;

      // Auto-edit subtitle sequence
      const words = ai.caption.split(/[\s\n]+/);
      const generatedCaptionLines = [];
      for (let i = 0; i < words.length; i += 4) {
        generatedCaptionLines.push(words.slice(i, i + 4).join(" "));
      }
      const finalCaptionLines = generatedCaptionLines.length ? generatedCaptionLines : [ai.caption];

      const ytId = extractYoutubeId(sourceUrl);
      const thumbnailFallback = ytId 
        ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
        : "";

      const { clip: created, error: createErr } = await clipService.createGeneratedClip(fresh, {
        title: passedTitle || ai.hashtags[0] || "Untitled clip",
        platform: "TikTok (9:16)",
        durationSeconds: Math.round(duration),
        caption: ai.caption,
        requiredCredit: credit,
        viralScore: ai.viral_score,
        sourceUrl,
        sourceChannel,
        thumbnail: link?.thumbnail || thumbnailFallback,
        videoUrl: sourceUrl,
        startSec: start,
        endSec: end,
        captionLines: finalCaptionLines,
        textStyle: "gradient",
        videoId: link?.id,
      });
      if (createErr || !created) {
        return c.json({ success: false, error: createErr ?? "Failed to create clip" }, 400);
      }

      return c.json({
        success: true,
        data: created,
      });
    } catch (e) {
      console.error("[generate-clip error]", e);
      return c.json({ success: false, error: "AI generation failed. Check your Gemini API key." }, 502);
    }
  });

  api.post("/api/clips/suggest-hooks", authMiddleware, async (c) => {
    const key = c.env.GEMINI_API_KEY;
    if (!key) {
      return c.json({ success: false, error: "AI not configured" }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    let transcript = String(body.transcript ?? "");
    const targetLength = Number(body.targetLength ?? 30);
    const thumbnailUrl = typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : undefined;
    const preRender = body.preRender === true;
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : undefined;
    const sourceChannel = typeof body.sourceChannel === "string" ? body.sourceChannel : "Unknown channel";
    const videoId = typeof body.videoId === "string" ? body.videoId : undefined;
    const clipType = typeof body.clipType === "string" ? body.clipType : undefined;

    // Auto-fetch transcript via Worker JS (YouTube InnerTube API) if not provided
    if (!transcript && sourceUrl) {
      const ytId = extractYtId(sourceUrl);
      if (ytId) {
        console.log(`[suggest-hooks] Auto-fetching transcript for ${ytId}`);
        const result = await fetchYoutubeTranscript(ytId);
        if (result) {
          transcript = result.text;
          console.log(`[suggest-hooks] Auto-fetched transcript: ${transcript.length} chars`);
        }
      }
    }
    
    if (!transcript) {
      return c.json({ success: false, error: "Transcript is required to generate hooks" }, 400);
    }
    if (preRender && !sourceUrl) {
      return c.json({ success: false, error: "sourceUrl is required for pre-render" }, 400);
    }

    try {
      const rawHooks = await generateHookSuggestions(key, c.env.GEMINI_MODEL, transcript, targetLength, thumbnailUrl, clipType);
      
      // Code-Enforced Trim: Ensure no AI drift beyond target limit
      let hooks = rawHooks.map(hook => {
        const duration = hook.endSec - hook.startSec;
        if (duration > targetLength) {
           return { ...hook, endSec: hook.startSec + targetLength };
        }
        return hook;
      });

      // ── Pre-render mode: create preview clips + queue renders ─────────────────
      if (preRender) {
        const db = createDatabase(c.env.DB);
        const user = c.get("user");
        const clipSvc = createClipService(db);

        hooks = await Promise.all(hooks.map(async (hook) => {
          const duration = hook.endSec - hook.startSec;
          const words = hook.caption.split(/[\s\n]+/);
          const generatedCaptionLines = [];
          for (let i = 0; i < words.length; i += 4) {
            generatedCaptionLines.push(words.slice(i, i + 4).join(" "));
          }

          const ytId = extractYoutubeId(sourceUrl!);
          const thumbnailFallback = ytId
            ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
            : "";

          const clip = await clipSvc.createPreRenderedClip(user.id, {
            title: hook.title || "New clip",
            platform: "TikTok (9:16)",
            durationSeconds: Math.round(duration),
            caption: hook.caption,
            requiredCredit: `Original video by ${sourceChannel}`,
            viralScore: hook.viral_score ?? 0,
            sourceUrl: sourceUrl!,
            sourceChannel,
            thumbnail: thumbnailUrl || thumbnailFallback,
            videoUrl: sourceUrl!,
            startSec: hook.startSec,
            endSec: hook.endSec,
            captionLines: generatedCaptionLines.length ? generatedCaptionLines : [hook.caption],
            textStyle: "gradient",
            videoId,
            aspectRatio: "9/16",
          });

          const jobId = await queueClipRender(db, clip.id, user.id, c.env, c.executionCtx, { isPreview: true });

          return { ...hook, clipId: clip.id, jobId, thumbnail: clip.thumbnail };
        }));
      }
      
      return c.json({ success: true, data: hooks });
    } catch (e) {
      console.error("[suggest-hooks]", e);
      return c.json({ success: false, error: "Failed to generate hook suggestions" }, 502);
    }
  });

  api.get("/api/links", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const userId = c.get("user").id;
    const links = await db.select().from(importedLinks).where(eq(importedLinks.userId, userId)).orderBy(importedLinks.createdAt);
    return c.json({ success: true, data: links });
  });

  api.post("/api/links", authMiddleware, async (c) => {
    const ip = c.req.raw.headers.get("cf-connecting-ip") || c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ok = await checkApiRateLimit(c.env.CACHE, ip);
    if (!ok) return c.json({ success: false, error: "Too many requests, slow down." }, 429);

    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    if (!body.url) return c.json({ success: false, error: "URL is required" }, 400);

    const db = createDatabase(c.env.DB);

    // Determine platform
    let platform = "other";
    if (body.url.includes("youtube.com") || body.url.includes("youtu.be")) platform = "youtube";
    else if (body.url.includes("tiktok.com")) platform = "tiktok";
    else if (body.url.includes("instagram.com")) platform = "instagram";
    else if (body.url.includes("facebook.com")) platform = "facebook";

    let videoTitle = body.title || "Imported Video";
    let videoThumbnail = body.thumbnail || null;

    const internalSecret = c.env.INTERNAL_WEBHOOK_SECRET;
    const gcHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(internalSecret ? { "X-Internal-Secret": internalSecret } : {}),
    };

    // ── 0. Dedup: return existing record if URL already imported by this user ──
    const existing = await db.select().from(importedLinks)
      .where(and(eq(importedLinks.userId, user.id), eq(importedLinks.url, body.url)))
      .limit(1);
    if (existing.length > 0) {
      const ex = existing[0];
      console.log(`[import] URL already exists for user, returning existing id: ${ex.id}`);
      return c.json({ success: true, data: { id: ex.id, platform: ex.platform, hasTranscript: !!ex.transcript } });
    }

    // ── 0b. Auto-resolve YouTube title + thumbnail via oEmbed (free, no API key) ──
    if (platform === "youtube" && (!body.title || !body.thumbnail)) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(body.url)}&format=json`;
        const oembedResp = await fetch(oembedUrl, { signal: AbortSignal.timeout(5_000) });
        if (oembedResp.ok) {
          const oembed = await oembedResp.json() as any;
          if (!body.title && oembed.title) {
            videoTitle = oembed.title;
            console.log(`[import] oEmbed title: ${videoTitle}`);
          }
          if (!body.thumbnail) {
            // Extract video ID and use hqdefault thumbnail
            const ytIdMatch = body.url.match(/[?&]v=([^&]+)/) || body.url.match(/youtu\.be\/([^?&]+)/);
            if (ytIdMatch?.[1]) {
              videoThumbnail = `https://img.youtube.com/vi/${ytIdMatch[1]}/hqdefault.jpg`;
              console.log(`[import] Auto-set YouTube thumbnail`);
            } else if (oembed.thumbnail_url) {
              videoThumbnail = oembed.thumbnail_url;
            }
          }
        }
      } catch (e) {
        console.warn("[import] oEmbed fetch failed (non-critical):", e);
      }
    }

    // ── 1. Insert record immediately so the user gets a fast response ─────────────
    // Transcription is kicked off in the background via waitUntil (fire-and-forget)
    // This prevents Cloudflare's 30s CPU limit from killing the request.
    const id = generateId();
    await db.insert(importedLinks).values({
      id,
      userId: user.id,
      url: body.url,
      platform,
      title: videoTitle,
      transcript: null,
      segments: null,
      thumbnail: videoThumbnail,
    });

    // ── 2. Background transcription (non-blocking) ────────────────────────────────
    const transcribeInBackground = async () => {
      let bgTranscript = "";
      let bgSegments: Array<{ word: string; start: number; end: number }> = [];
      let lastError: string | null = null;

      // ── Try 1: Renderer subtitle extraction (yt-dlp captions via Cloud Run proxy) ─
      // This is the most reliable method because yt-dlp on Cloud Run uses rotating
      // Webshare residential proxies to bypass YouTube's datacenter IP blocks.
      const tryRenderer = async () => {
        if (!c.env.RENDERER_URL) {
          console.warn("[transcript:bg] RENDERER_URL not configured");
          return false;
        }
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[transcript:bg] Renderer transcript attempt ${attempt} for ${body.url}`);
            const renderResp = await fetch(`${c.env.RENDERER_URL}/transcript`, {
              method: "POST",
              headers: gcHeaders,
              body: JSON.stringify({ url: body.url }),
              signal: AbortSignal.timeout(60_000),
            });
            console.log(`[transcript:bg] Renderer HTTP ${renderResp.status}`);
            if (renderResp.ok) {
              const data = await renderResp.json() as any;
              if (data.success && data.transcript) {
                bgTranscript = data.transcript;
                console.log(`[transcript:bg] Renderer transcript success: ${bgTranscript.length} chars`);
                return true;
              } else {
                lastError = data.error || `Renderer returned success=false`;
                console.error(`[transcript:bg] Renderer bad response:`, data);
              }
            } else {
              const errText = await renderResp.text().catch(() => "unknown");
              lastError = `Renderer HTTP ${renderResp.status}: ${errText}`;
              console.error(`[transcript:bg] Renderer HTTP error ${renderResp.status}:`, errText);
            }
          } catch (e: any) {
            lastError = e?.message || String(e);
            console.error(`[transcript:bg] Renderer attempt ${attempt} exception:`, e);
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
        }
        return false;
      };

      // ── Try 2: Whisper (audio transcription via Cloud Run proxy) ─────────────────
      // Downloads audio with yt-dlp + proxy, then transcribes with Faster-Whisper.
      // Slower but works when subtitles are unavailable.
      const tryWhisper = async () => {
        const whisperUrl = c.env.WHISPER_URL;
        if (!whisperUrl) {
          console.warn("[transcript:bg] WHISPER_URL not configured");
          return false;
        }
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[transcript:bg] Whisper attempt ${attempt} for ${body.url}`);
            const whisperResp = await fetch(`${whisperUrl}/transcribe`, {
              method: "POST",
              headers: gcHeaders,
              body: JSON.stringify({ url: body.url }),
              signal: AbortSignal.timeout(300_000),
            });
            console.log(`[transcript:bg] Whisper HTTP ${whisperResp.status}`);
            if (whisperResp.ok) {
              const data = await whisperResp.json() as any;
              if (data.success && data.text) {
                bgTranscript = data.text;
                bgSegments = Array.isArray(data.segments) ? data.segments : [];
                console.log(`[transcript:bg] Whisper success: ${bgTranscript.length} chars`);
                return true;
              } else {
                lastError = data.error || `Whisper returned success=false`;
                console.error(`[transcript:bg] Whisper bad response:`, data);
              }
            } else {
              const errText = await whisperResp.text().catch(() => "unknown");
              lastError = `Whisper HTTP ${whisperResp.status}: ${errText}`;
              console.error(`[transcript:bg] Whisper HTTP error ${whisperResp.status}:`, errText);
            }
          } catch (e: any) {
            lastError = e?.message || String(e);
            console.error(`[transcript:bg] Whisper attempt ${attempt} exception:`, e);
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
        }
        return false;
      };

      // ── Try 3: Pure-JS Worker extraction (fast but often blocked by YouTube) ─────
      // Only works for YouTube videos when YouTube isn't blocking Cloudflare IPs.
      const tryWorkerJs = async () => {
        if (platform !== "youtube") return false;
        const ytId = extractYtId(body.url);
        if (!ytId) return false;
        try {
          console.log(`[transcript:bg] Worker JS attempt for ${body.url}`);
          const result = await fetchYoutubeTranscript(ytId);
          if (result) {
            bgTranscript = result.text;
            bgSegments = result.segments;
            console.log(`[transcript:bg] Worker JS success: ${bgTranscript.length} chars`);
            return true;
          }
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.error(`[transcript:bg] Worker JS failed:`, e);
        }
        return false;
      };

      try {
        const rendererOk = await tryRenderer();
        if (!rendererOk) {
          const whisperOk = await tryWhisper();
          if (!whisperOk) await tryWorkerJs();
        }

        if (bgTranscript) {
          await db.update(importedLinks)
            .set({
              transcript: bgTranscript,
              segments: bgSegments.length > 0 ? Array.from(bgSegments) : null,
            })
            .where(eq(importedLinks.id, id));
          console.log(`[transcript:bg] Updated record ${id} with transcript`);
        } else {
          console.error(`[transcript:bg] All transcript methods failed for ${id}. Last error: ${lastError || "unknown"}`);
        }
      } catch (e) {
        console.error("[transcript:bg] Background transcription failed:", e);
      }
    };

    c.executionCtx.waitUntil(transcribeInBackground());

    return c.json({ success: true, data: { id, platform, hasTranscript: false } });
  });

  api.delete("/api/links/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const id = (c.req.param("id") as string);
    await db.delete(importedLinks).where(and(eq(importedLinks.id, id), eq(importedLinks.userId, c.get("user").id)));
    return c.json({ success: true });
  });

  api.patch("/api/links/:id/transcript", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const id = (c.req.param("id") as string);
    const body = await c.req.json().catch(() => ({}));
    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    if (!transcript.trim()) return c.json({ success: false, error: "transcript is required" }, 400);

    const [link] = await db.select().from(importedLinks).where(and(eq(importedLinks.id, id), eq(importedLinks.userId, user.id))).limit(1);
    if (!link) return c.json({ success: false, error: "Link not found" }, 404);

    await db.update(importedLinks).set({ transcript }).where(eq(importedLinks.id, id as string));
    return c.json({ success: true });
  });

  api.get("/api/links/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const id = (c.req.param("id") as string);
    const userId = c.get("user").id;
    const [link] = await db.select().from(importedLinks).where(and(eq(importedLinks.id, id), eq(importedLinks.userId, userId))).limit(1);
    if (!link) return c.json({ success: false, error: "Link not found" }, 404);
    return c.json({ success: true, data: link });
  });

  api.get("/api/clips", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const list = await createClipService(db).listClips(c.get("user").id);
    const data = list.map((row) => ({
      id: row.id,
      title: row.title,
      platform: row.platform,
      duration: row.duration ?? undefined,
      durationSeconds: row.durationSeconds ?? undefined,
      status: row.status,
      views: row.views ?? undefined,
      engagement: row.engagement ?? undefined,
      thumbnail: row.thumbnail ?? undefined,
      videoUrl: row.videoUrl ?? undefined,
      sourceUrl: row.sourceUrl ?? undefined, // ← FIX: include source URL so editor can always find a playable URL
      caption: row.caption ?? undefined,
      editCount: row.editCount ?? 0,
      createdAt: row.createdAt ?? new Date(),
      // Editor fields
      startSec: row.startSec ?? undefined,
      endSec: row.endSec ?? undefined,
      captionLines: Array.isArray(row.captionLines) ? row.captionLines : undefined,
      combinedClipIds: Array.isArray(row.combinedClipIds) ? row.combinedClipIds : undefined,
      textStyle: row.textStyle ?? undefined,
      mediaUrls: Array.isArray(row.mediaUrls) ? row.mediaUrls : undefined,
      viralScore: row.viralScore ?? undefined,
    }));
    return c.json({ success: true, data });
  });


  api.get("/api/clips/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const clipSvc = createClipService(db);
    const clip = await clipSvc.getClipById((c.req.param("id") as string), c.get("user").id);
    if (!clip) {
      return c.json({ success: false, error: "Not found" }, 404);
    }
    return c.json({ success: true, data: clip });
  });

  api.patch("/api/clips/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.title === "string") updates.title = body.title.slice(0, 200);
    if (typeof body.caption === "string") updates.caption = body.caption;
    if (typeof body.platform === "string") updates.platform = body.platform;
    if (typeof body.status === "string") updates.status = body.status;

    // ── Editor fields ──────────────────────────────────────────────────────
    if (typeof body.startSec === "number") updates.startSec = body.startSec;
    if (typeof body.endSec === "number") updates.endSec = body.endSec;
    if (typeof body.textStyle === "string") updates.textStyle = body.textStyle;
    if (Array.isArray(body.captionLines)) {
      updates.captionLines = JSON.stringify(body.captionLines.slice(0, 20));
    }
    if (Array.isArray(body.combinedClipIds)) {
      updates.combinedClipIds = JSON.stringify(body.combinedClipIds.slice(0, 20));
    }
    if (Array.isArray(body.mediaUrls)) {
      updates.mediaUrls = JSON.stringify(body.mediaUrls.slice(0, 10));
    }
    if (typeof body.aspectRatio === "string") updates.aspectRatio = body.aspectRatio;

    const clipSvc = createClipService(db);
    const [fullUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!fullUser) {
      return c.json({ success: false, error: "User not found" }, 404);
    }
    const { clip, error } = await clipSvc.updateClip(
      (c.req.param("id") as string),
      user.id,
      updates as any,
      fullUser.plan,
    );
    if (error || !clip) {
      return c.json({ success: false, error: error ?? "Failed to update" }, 400);
    }
    return c.json({ success: true, data: clip });
  });


  api.delete("/api/clips/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const clipId = (c.req.param("id") as string);
    const clipSvc = createClipService(db);
    const clip = await clipSvc.getClipById(clipId, user.id);
    if (!clip) {
      return c.json({ success: false, error: "Clip not found" }, 404);
    }
    await db.delete(clips).where(and(eq(clips.id, clipId), eq(clips.userId, user.id)));
    await clipSvc.logActivity(user.id, "clip_deleted", { clipId });
    return c.json({ success: true, data: null });
  });

  api.post("/api/clips/:id/render", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const id = (c.req.param("id") as string);

    // Rate limit renders per IP
    const ip = c.req.raw.headers.get("cf-connecting-ip") || c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ok = await checkApiRateLimit(c.env.CACHE, ip);
    if (!ok) return c.json({ success: false, error: "Too many render requests, slow down." }, 429);
    
    const clipSvc = createClipService(db);
    const clip = await clipSvc.getClipById(id, user.id);
    if (!clip) return c.json({ success: false, error: "Clip not found" }, 404);

    const jobId = await queueClipRender(db, id, user.id, c.env, c.executionCtx);
    return c.json({ success: true, data: { jobId } });
  });

  api.post("/api/clips/:id/select", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const id = (c.req.param("id") as string);
    const clipSvc = createClipService(db);

    const [freshUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!freshUser) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    const { clip, error } = await clipSvc.selectPreRenderedClip(id, freshUser);
    if (error || !clip) {
      return c.json({ success: false, error: error ?? "Failed to select clip" }, 400);
    }

    // Archive sibling preview clips so they don't clutter the UI
    try {
      const siblingConditions = [eq(clips.userId, user.id), eq(clips.status, "preview")];
      if (clip.videoId) {
        siblingConditions.push(eq(clips.videoId, clip.videoId));
      } else if (clip.sourceUrl) {
        siblingConditions.push(eq(clips.sourceUrl, clip.sourceUrl));
      }
      const siblings = await db
        .select()
        .from(clips)
        .where(and(...siblingConditions));
      for (const sib of siblings) {
        if (sib.id !== clip.id) {
          await db.update(clips).set({ status: "archived", updatedAt: new Date() }).where(eq(clips.id, sib.id));
        }
      }
    } catch (e) {
      console.error("[select] sibling archive error:", e);
    }

    return c.json({ success: true, data: clip });
  });

  api.get("/api/render-jobs/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const jobId = (c.req.param("id") as string);
    const [job] = await db.select().from(renderJobs).where(and(eq(renderJobs.id, jobId), eq(renderJobs.userId, user.id))).limit(1);
    if (!job) return c.json({ success: false, error: "Not found" }, 404);
    return c.json({ success: true, data: { status: job.status, videoUrl: job.videoUrl, error: job.error, attempts: job.attempts } });
  });

  // ── Media upload → R2 ────────────────────────────────────────────────────
  api.post("/api/media/upload", authMiddleware, async (c) => {
    const bucket = (c.env as any).MEDIA_BUCKET;
    if (!bucket) {
      return c.json({ success: false, error: "Media storage not configured" }, 503);
    }
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return c.json({ success: false, error: "Multipart form required" }, 400);
    }
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ success: false, error: "Invalid form data" }, 400);
    }
    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ success: false, error: "No file provided" }, 400);
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    const isAudio = file.type.startsWith("audio/");
    if (!isVideo && !isImage && !isAudio) {
      return c.json({ success: false, error: "Only image, video, and audio uploads are allowed" }, 415);
    }

    const maxBytes = isVideo ? 100 * 1024 * 1024 : isAudio ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      const max = isVideo ? "100MB" : isAudio ? "50MB" : "5MB";
      return c.json({ success: false, error: `File exceeds ${max} limit` }, 413);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const key = `media/${c.get("user").id}/${Date.now()}.${ext}`;
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const publicUrl = `/r2/${key}`;
    return c.json({ success: true, data: { url: publicUrl } });
  });


  api.get("/api/scheduled-posts", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const rows = await createClipService(db).listScheduled(c.get("user").id);
    const data = rows.map((r) => ({
      id: r.id,
      clipTitle: r.title || "Scheduled clip",
      platform: r.platform,
      scheduledFor: r.scheduledFor,
      status: r.status,
      thumbnail: r.thumbnail ?? undefined,
    }));
    return c.json({ success: true, data });
  });

  api.post("/api/scheduled-posts", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const clipId = String(body.clipId ?? "");
    const platform = String(body.platform ?? "");
    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
    if (!clipId || !platform || !scheduledFor || isNaN(scheduledFor.getTime())) {
      return c.json({ success: false, error: "clipId, platform, and scheduledFor are required" }, 400);
    }
    const clipSvc = createClipService(db);
    const clip = await clipSvc.getClipById(clipId, user.id);
    if (!clip) return c.json({ success: false, error: "Clip not found" }, 404);
    const { scheduledPosts } = await import("./database/schema");
    const id = generateId();
    await db.insert(scheduledPosts).values({
      id,
      userId: user.id,
      clipId,
      title: clip.title,
      platform,
      scheduledFor,
      status: "scheduled",
      thumbnail: clip.thumbnail ?? null,
      createdAt: new Date(),
    });
    return c.json({ success: true, data: { id } });
  });

  api.delete("/api/scheduled-posts/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const postId = (c.req.param("id") as string);
    const { scheduledPosts } = await import("./database/schema");
    const [existing] = await db.select().from(scheduledPosts)
      .where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, user.id)))
      .limit(1);
    if (!existing) return c.json({ success: false, error: "Scheduled post not found" }, 404);
    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, postId));
    return c.json({ success: true });
  });

  api.get("/api/dashboard/activity", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const logs = await createClipService(db).listRecentActivity(c.get("user").id);
    const data = logs.map((l) => ({
      id: l.id,
      type: l.action,
      title: l.action,
      createdAt: l.createdAt ?? new Date(),
      meta: l.meta,
    }));
    return c.json({ success: true, data });
  });

  api.get("/api/dashboard/usage", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const [u] = await db.select().from(users).where(eq(users.id, c.get("user").id)).limit(1);
    if (!u) {
      return c.json({ success: false, error: "Not found" }, 404);
    }
    const summary = await createClipService(db).getUsageSummary(u);
    return c.json({ success: true, data: summary });
  });

  api.get("/api/dashboard", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const userId = c.get("user").id;
    const clipSvc = createClipService(db);

    const [[u], clipList, scheduledRows, logs] = await Promise.all([
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      clipSvc.listClips(userId),
      clipSvc.listScheduled(userId),
      clipSvc.listRecentActivity(userId),
    ]);

    const usage = u ? await clipSvc.getUsageSummary(u) : null;
    const activity = logs.map((l) => ({
      id: l.id,
      type: l.action,
      title: l.action,
      createdAt: l.createdAt ?? new Date(),
      meta: l.meta,
    }));
    const scheduledPosts = scheduledRows.map((r) => ({
      id: r.id,
      clipTitle: r.title || "Scheduled clip",
      platform: r.platform,
      scheduledFor: r.scheduledFor,
      status: r.status,
      thumbnail: r.thumbnail ?? undefined,
    }));

    return c.json({ success: true, data: { activity, usage, clips: clipList, scheduledPosts } });
  });

  api.get("/api/affiliate/stats", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const userId = c.get("user").id;
    await createUserService(db).ensureAffiliateRow(userId);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1);
    if (!aff) {
      return c.json({ success: false, error: "Affiliate record missing" }, 500);
    }
    const refs = await db
      .select()
      .from(affiliateReferrals)
      .where(eq(affiliateReferrals.affiliateId, aff.id));
    const conversions = refs.filter((r) => r.status === "paid" || r.status === "pending").length;
    return c.json({
      success: true,
      data: {
        referralCode: aff.referralCode,
        totalClicks: 0,
        totalConversions: conversions,
        activeReferrals: refs.filter((r) => r.status === "pending").length,
        lifetimeEarnings: aff.totalEarned ?? 0,
        pendingPayout: aff.pendingPayout ?? 0,
      },
    });
  });

  api.post("/api/affiliate/request-payout", authMiddleware, async (c) => {
    const user = c.get("user");
    if (user.plan === "free") {
      return c.json({ success: false, error: "Pro or Agency required" }, 403);
    }
    return c.json(
      {
        success: false,
        error: "Stripe Connect payout is not configured for this deployment yet.",
      },
      501,
    );
  });

  api.get("/api/billing/subscription", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const sub = await createSubscriptionService(db).findActiveForUser(c.get("user").id);
    if (!sub) {
      return c.json({ success: true, data: null });
    }
    return c.json({
      success: true,
      data: {
        id: sub.id,
        userId: sub.userId,
        status: sub.status,
        planName: sub.planName,
        planInterval: sub.planInterval,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      },
    });
  });

  api.get("/api/billing/prices", async (c) => {
    const sk = c.env.STRIPE_SECRET_KEY;
    if (!sk) {
      return c.json({ success: false, error: "Billing not configured" }, 503);
    }
    try {
      const stripe = getStripe(sk);
      const prices = await listPricesAndProducts(stripe);
      return c.json({ success: true, data: prices });
    } catch (e) {
      console.error("[prices]", e);
      return c.json({ success: false, error: "Failed to load prices" }, 502);
    }
  });

  api.get("/api/billing/payments", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const rows = await createSubscriptionService(db).listPaymentsForUser(c.get("user").id);
    const data = rows.map((p) => ({
      id: p.id,
      userId: p.userId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      invoicePdf: p.invoicePdf,
      createdAt: p.createdAt ?? new Date(),
    }));
    return c.json({ success: true, data });
  });

  api.post("/api/billing/checkout", authMiddleware, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const priceId = String(body.priceId ?? "");
    if (!priceId) {
      return c.json({ success: false, error: "priceId required" }, 400);
    }
    const sk = c.env.STRIPE_SECRET_KEY;
    if (!sk) {
      return c.json({ success: false, error: "Billing not configured" }, 503);
    }
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const stripe = getStripe(sk);
    const customerId = await getOrCreateStripeCustomer(
      stripe,
      user.stripeCustomerId,
      user.email,
      user.id,
    );
    if (!user.stripeCustomerId) {
      await createUserService(db).setStripeCustomerId(user.id, customerId);
    }
    const appUrl = String(c.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
    
    // SECURITY FIX: Never trust client for trial days or quantity
    // Define them server-side based on the price ID if necessary.
    const trialDays = undefined;
    const quantity = 1;
    const url = await createCheckoutSession(stripe, {
      customerId,
      priceId,
      successUrl: `${appUrl}/dashboard?upgraded=true`,
      cancelUrl: `${appUrl}/billing`,
      trialDays,
      quantity,
      metadata: { user_id: user.id },
    });
    return c.json({ success: true, data: { url } });
  });

  api.post("/api/billing/portal", authMiddleware, async (c) => {
    const sk = c.env.STRIPE_SECRET_KEY;
    if (!sk) {
      return c.json({ success: false, error: "Billing not configured" }, 503);
    }
    const user = c.get("user");
    if (!user.stripeCustomerId) {
      return c.json({ success: false, error: "No Stripe customer" }, 400);
    }
    const stripe = getStripe(sk);
    const appUrl = String(c.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const url = await createPortalSession(stripe, user.stripeCustomerId, `${appUrl}/settings`);
    return c.json({ success: true, data: { url } });
  });

  api.post("/api/stripe/webhook", async (c) => {
    const secret = c.env.STRIPE_WEBHOOK_SECRET;
    const sig = c.req.header("stripe-signature") || "";
    const payload = await c.req.text();
    if (!secret || !c.env.STRIPE_SECRET_KEY) {
      return c.json({ received: true });
    }
    const event = await verifyWebhookSignature(payload, sig, secret, c.env.STRIPE_SECRET_KEY);
    if (!event) {
      return c.json({ received: true });
    }
    const db = createDatabase(c.env.DB);

    // SECURITY FIX: Atomic idempotency — insert first, let unique constraint dedupe races
    try {
      await db.insert(processedWebhookEvents).values({ id: generateId(), eventId: event.id });
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE constraint failed") || err?.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return c.json({ received: true });
      }
      throw err;
    }

    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
    const subSvc = createSubscriptionService(db);

    // Serialize plan updates per user via short KV lock to prevent races
    const withUserLock = async (userId: string, fn: () => Promise<void>) => {
      const lockKey = `stripe_lock:${userId}`;
      const existing = await c.env.CACHE.get(lockKey);
      if (existing) {
        console.log(`[stripe webhook] Waiting for existing lock for user ${userId}`);
        await new Promise((r) => setTimeout(r, 800));
      }
      await c.env.CACHE.put(lockKey, event.id, { expirationTtl: 15 });
      try {
        await fn();
      } finally {
        await c.env.CACHE.delete(lockKey);
      }
    };

    try {
      switch (event.type) {
        case WEBHOOK_EVENTS.CHECKOUT_COMPLETED: {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.user_id;
          const subId = session.subscription;
          if (userId && typeof subId === "string") {
            const stripeSub = await stripe.subscriptions.retrieve(subId);
            await subSvc.upsertFromStripeSubscription(userId, stripeSub);
            await withUserLock(userId, async () => {
              await syncUserPlanFromSubscription(
                db,
                userId,
                stripeSub,
                c.env.STRIPE_PRO_PRICE_ID || "",
                c.env.STRIPE_AGENCY_PRICE_ID || "",
              );
            });
          }
          break;
        }
        case WEBHOOK_EVENTS.SUBSCRIPTION_UPDATED: {
          const stripeSub = event.data.object as Stripe.Subscription;
          const row = await subSvc.findByStripeSubscriptionId(stripeSub.id);
          if (row) {
            await subSvc.upsertFromStripeSubscription(row.userId, stripeSub);
            await withUserLock(row.userId, async () => {
              await syncUserPlanFromSubscription(
                db,
                row.userId,
                stripeSub,
                c.env.STRIPE_PRO_PRICE_ID || "",
                c.env.STRIPE_AGENCY_PRICE_ID || "",
              );
            });
          }
          break;
        }
        case WEBHOOK_EVENTS.SUBSCRIPTION_DELETED: {
          const stripeSub = event.data.object as Stripe.Subscription;
          const row = await subSvc.findByStripeSubscriptionId(stripeSub.id);
          if (row) {
            await db
              .update(users)
              .set({ plan: "free", updatedAt: new Date() })
              .where(eq(users.id, row.userId));
          }
          break;
        }
        case WEBHOOK_EVENTS.INVOICE_PAYMENT_FAILED: {
          const inv = event.data.object as Stripe.Invoice;
          const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          if (customerId) {
            const [u] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
            if (u) {
              c.executionCtx?.waitUntil(
                sendResendEmail(
                  c.env,
                  u.email,
                  "Payment failed — viraltrim",
                  `<p>We could not process your subscription payment. Please update your card in the billing portal.</p>`,
                ).then(() => undefined),
              );
            }
          }
          break;
        }
        case WEBHOOK_EVENTS.INVOICE_PAYMENT_SUCCEEDED: {
          const inv = event.data.object as Stripe.Invoice;
          const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          if (customerId && inv.amount_paid != null) {
            const [u] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
            if (u) {
              await subSvc.recordPayment({
                userId: u.id,
                stripeInvoiceId: inv.id,
                amount: inv.amount_paid,
                currency: inv.currency,
                status: "paid",
                invoicePdf: inv.invoice_pdf ?? null,
              });
              const [ref] = await db
                .select()
                .from(affiliateReferrals)
                .where(
                  and(eq(affiliateReferrals.referredUserId, u.id), eq(affiliateReferrals.status, "pending")),
                )
                .limit(1);
              if (ref) {
                const paidUsd = (inv.amount_paid ?? 0) / 100;
                const commission = paidUsd * 0.3;
                await db
                  .update(affiliateReferrals)
                  .set({ status: "paid", commissionAmount: commission })
                  .where(eq(affiliateReferrals.id, ref.id));
                const [affRow] = await db
                  .select()
                  .from(affiliates)
                  .where(eq(affiliates.id, ref.affiliateId))
                  .limit(1);
                if (affRow) {
                  await db
                    .update(affiliates)
                    .set({
                      totalEarned: (affRow.totalEarned ?? 0) + commission,
                      pendingPayout: (affRow.pendingPayout ?? 0) + commission,
                    })
                    .where(eq(affiliates.id, affRow.id));
                }
              }
            }
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("[stripe webhook]", err);
    }
    return c.json({ received: true });
  });

  api.post("/api/chatbot", async (c) => {
    const ip =
      c.req.raw.headers.get("cf-connecting-ip") ||
      c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const ok = await checkChatbotRateLimit(c.env.CACHE, ip);
    if (!ok) {
      return c.json({ success: false, error: "Rate limit exceeded" }, 429);
    }
    const key = c.env.GEMINI_API_KEY;
    if (!key) {
      return c.json({ success: false, error: "Assistant unavailable" }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      message?: string;
      history?: { role: string; content: string }[];
    };
    const message = String(body.message ?? "").trim();
    if (!message) {
      return c.json({ success: false, error: "message required" }, 400);
    }
    try {
      const reply = await chatbotReply(key, c.env.GEMINI_MODEL, message, body.history ?? []);
      return c.json({ success: true, data: { reply } });
    } catch (e) {
      console.error("[chatbot]", e);
      return c.json({ success: false, error: "Assistant error" }, 502);
    }
  });

  api.post("/api/dmca/report", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const reporterName = String(body.reporterName ?? body.reporter_name ?? "");
    const reporterEmail = String(body.reporterEmail ?? body.reporter_email ?? "");
    const originalWorkUrl = String(body.originalWorkUrl ?? body.original_work_url ?? "");
    const infringingUrl = String(body.infringingUrl ?? body.infringing_url ?? "");
    const electronicSignature = String(body.electronicSignature ?? body.electronic_signature ?? "");
    const goodFaith = Boolean(body.goodFaithStatement ?? body.good_faith_statement);
    const accuracy = Boolean(body.accuracyStatement ?? body.accuracy_statement);
    if (!reporterName || !reporterEmail || !originalWorkUrl || !infringingUrl || !electronicSignature) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }
    if (!goodFaith || !accuracy) {
      return c.json({ success: false, error: "Required statements must be accepted" }, 400);
    }
    const db = createDatabase(c.env.DB);

    // Find affected clips and user
    const affectedClips = await db.select().from(clips).where(
      or(eq(clips.videoUrl, infringingUrl), eq(clips.sourceUrl, infringingUrl))
    ).limit(10);
    const reportedUserId = affectedClips[0]?.userId ?? null;

    // Auto-takedown: mark clips removed and delete from R2
    for (const clipRow of affectedClips) {
      if (clipRow.videoUrl) {
        try {
          const key = clipRow.videoUrl.replace(/^.*\/renders\//, "renders/");
          await c.env.MEDIA.delete(key);
        } catch (e) {
          console.error("[dmca] Failed to delete R2 object:", e);
        }
      }
      await db.update(clips).set({ status: "removed", videoUrl: null, updatedAt: new Date() }).where(eq(clips.id, clipRow.id));
    }

    const id = generateId();
    await db.insert(dmcaReports).values({
      id,
      reporterName,
      reporterEmail,
      originalWorkUrl,
      infringingUrl,
      description: body.description ? String(body.description) : undefined,
      goodFaithStatement: true,
      accuracyStatement: true,
      electronicSignature,
      status: "pending",
      reportedUserId,
    });
    const admin = c.env.RESEND_ADMIN_EMAIL || "admin@viraltrim.com";
    const report = {
      id,
      reporterName,
      reporterEmail,
      originalWorkUrl,
      infringingUrl,
      description: body.description ? String(body.description) : "",
    };
    c.executionCtx?.waitUntil(
      Promise.all([
        sendResendEmail(c.env, admin, "DMCA report", dmcaAdminHtml(report)),
        sendResendEmail(
          c.env,
          reporterEmail,
          "We received your DMCA notice",
          "<p>We have received your DMCA takedown notice and will review it within 5 business days.</p>",
        ),
      ]).then(() => undefined),
    );
    return c.json({ success: true, data: { id } });
  });

  api.post("/api/internal/enforce-dmca-strikes", async (c) => {
    const secret = c.req.header("x-internal-secret");
    if (!c.env.INTERNAL_WEBHOOK_SECRET || secret !== c.env.INTERNAL_WEBHOOK_SECRET) {
      return c.json({ success: false, error: "Forbidden" }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as { reported_user_id?: string };
    const reportedUserId = String(body.reported_user_id ?? "");
    if (!reportedUserId) {
      return c.json({ success: false, error: "reported_user_id required" }, 400);
    }
    const db = createDatabase(c.env.DB);
    const [row] = await db
      .select({ c: count() })
      .from(dmcaReports)
      .where(and(eq(dmcaReports.reportedUserId, reportedUserId), eq(dmcaReports.status, "upheld")));
    const n = Number(row?.c ?? 0);
    if (n >= 3) {
      await db
        .update(users)
        .set({ isBanned: true, updatedAt: new Date() })
        .where(eq(users.id, reportedUserId));
    }
    return c.json({ success: true, data: { upheldCount: n, banned: n >= 3 } });
  });

  // ─── API Key Management (Headless / Mobile / Developer API) ───────────────────

  /**
   * POST /api/keys
   * Creates a new API key for the authenticated user.
   * Returns the raw key ONCE — it cannot be retrieved again.
   * Body: { name?: string }  — optional label, e.g. "iOS App"
   */
  api.post("/api/keys", authMiddleware, async (c) => {
    const ip = c.req.raw.headers.get("cf-connecting-ip") || c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ok = await checkApiRateLimit(c.env.CACHE, ip);
    if (!ok) return c.json({ success: false, error: "Too many requests, slow down." }, 429);

    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({})) as { name?: string };
    const name = String(body.name || "Default Key").slice(0, 64);

    // Enforce a max of 10 keys per user
    const existing = await db.select().from(apiKeys).where(eq(apiKeys.userId, user.id));
    const activeKeys = existing.filter(k => !k.isRevoked);
    if (activeKeys.length >= 10) {
      return c.json({ success: false, error: "Maximum of 10 API keys reached. Revoke an existing key first." }, 400);
    }

    const { generateApiKey } = await import("./auth");
    const { raw, hash } = await generateApiKey();
    const id = generateId();

    await db.insert(apiKeys).values({ id, userId: user.id, keyHash: hash, name });

    return c.json({
      success: true,
      data: {
        id,
        name,
        key: raw, // ← shown ONCE. User must copy it now.
        createdAt: new Date().toISOString(),
        warning: "Save this key now. It will not be shown again.",
      },
    }, 201);
  });

  /**
   * GET /api/keys
   * Lists all API keys for the authenticated user.
   * Never returns key hashes or raw keys — only metadata.
   */
  api.get("/api/keys", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        isRevoked: apiKeys.isRevoked,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id))
      .orderBy(apiKeys.createdAt);

    return c.json({ success: true, data: rows });
  });

  /**
   * DELETE /api/keys/:id
   * Revokes (soft-deletes) an API key. The key immediately stops working.
   */
  api.delete("/api/keys/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const user = c.get("user");
    const keyId = (c.req.param("id") as string);

    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, user.id)))
      .limit(1);

    if (!existing) {
      return c.json({ success: false, error: "API key not found" }, 404);
    }
    if (existing.isRevoked) {
      return c.json({ success: false, error: "Key is already revoked" }, 400);
    }

    await db.update(apiKeys).set({ isRevoked: true }).where(eq(apiKeys.id, keyId));
    return c.json({ success: true, data: { id: keyId, revoked: true } });
  });

  // ─── AI Video Studio Routes ───────────────────────────────────────────────────
  const aiVideoApp = new Hono<AppEnv>();
  aiVideoApp.use("*", authMiddleware);
  registerAiVideoRoutes(aiVideoApp);
  api.route("", aiVideoApp);
}


function extractYoutubeId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1).slice(0, 11);
    }
    const v = u.searchParams.get("v");
    if (v) {
      return v.slice(0, 11);
    }
  } catch {
    /* ignore */
  }
  return "dQw4w9WgXcQ";
}
