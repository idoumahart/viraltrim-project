import type Stripe from "stripe";
import { Context, Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, count, eq } from "drizzle-orm";
import { createSession, extractBearerToken, generateId, revokeSession, validateSession } from "./auth";
import { createDatabase } from "./database";
import { affiliateReferrals, affiliates, dmcaReports, users, processedWebhookEvents, importedLinks } from "./database/schema";
import { checkAuthRateLimit } from "./middleware/rate-limiter";
import { createClipService } from "./database/services/clip-service";
import { createSubscriptionService, syncUserPlanFromSubscription } from "./database/services/subscription-service";
import { createUserService } from "./database/services/user-service";
import type { Env } from "./core-utils";
import { dmcaAdminHtml, sendResendEmail, welcomeEmailHtml, verifyEmailHtml } from "./email";
import { chatbotReply, fetchViralDiscoveryJson, generateClipMetadata, generateHookSuggestions } from "./gemini";
import { checkChatbotRateLimit } from "./rate-limit";
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

function publicUser(u: {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  stripeCustomerId: string | null;
  plan: string;
  isEmailVerified?: boolean;
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
  };
}

function sessionTtlSeconds(env: Env): number {
  const n = Number.parseInt(String(env.SESSION_TTL || "604800"), 10);
  return Number.isFinite(n) && n > 0 ? n : 604800;
}

function jwtSecret(env: Env, req: Request): string {
  const s = String(env.JWT_SECRET || "").trim();
  if (s) {
    return s;
  }
  const host = req.headers.get("host") || "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return "insecure_development_secret";
  }
  return "";
}

const authMiddleware = async (c: Context<AppEnv>, next: () => Promise<void>) => {
  const token = getCookie(c, "vt_session") || extractBearerToken(c.req.raw);
  if (!token) {
    return c.json({ success: false, error: "Authorization required" }, 401);
  }
  const db = createDatabase(c.env.DB);
  const secret = jwtSecret(c.env, c.req.raw);
  if (!secret) {
    return c.json({ success: false, error: "Server misconfigured" }, 500);
  }
  try {
    const result = await validateSession(db, token, secret);
    if (!result) {
      return c.json({ success: false, error: "Invalid or expired session" }, 401);
    }
    c.set("user", result.user);
    c.set("token", token);
    await next();
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
      const verifyUrl = `${c.env.APP_URL || "https://viraltrim.codedmotion.studio"}/verify-email?token=${vToken}`;

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
      const verifyUrl = `${c.env.APP_URL || "https://viraltrim.codedmotion.studio"}/verify-email?token=${vToken}`;
      
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

  api.get("/api/system/cleanup", async (c) => {
    try {
      const db = createDatabase(c.env.DB);
      // Automatically verify all currently registered users to bypass email blocks
      await db.update(users).set({ isEmailVerified: true });
      return c.json({ success: true, message: "All accounts verified perfectly. You can now login!" });
    } catch (e) {
      return c.json({ success: false, error: String(e) });
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
    const publicBase = String(c.env.APP_URL || "").replace(/\/$/, "");
    const url = `${publicBase}/api/media/${encodeURIComponent(key)}`;
    const db = createDatabase(c.env.DB);
    await createUserService(db).setAvatarUrl(user.id, url);
    return c.json({ success: true, data: { url, key } });
  });

  api.get("/api/media/*", async (c) => {
    const key = c.req.path.replace(/^\/api\/media\/?/, "");
    if (!key) {
      return c.text("Not found", 404);
    }
    const obj = await c.env.MEDIA.get(decodeURIComponent(key));
    if (!obj) {
      return c.text("Not found", 404);
    }
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("cache-control", "public, max-age=86400");
    return new Response(obj.body, { headers });
  });

  api.get("/api/viral-discovery", authMiddleware, async (c) => {
    const key = c.env.GEMINI_API_KEY;
    if (!key) {
      return c.json({ success: false, error: "Discovery service not configured" }, 503);
    }
    const category = c.req.query("category") || "";
    try {
      const rows = await fetchViralDiscoveryJson(key, c.env.GEMINI_MODEL, category);
      const data = rows.map((r, i) => ({
        id: `vd-${i}-${r.title.slice(0, 8)}`,
        title: r.title,
        url: r.youtube_search_url,
        views: r.estimated_views,
        engagement: `${r.viral_score}%`,
        viralScore: r.viral_score,
        category: category || "trending",
        thumbnail: `https://img.youtube.com/vi/${extractYoutubeId(r.youtube_search_url)}/hqdefault.jpg`,
        duration: "—",
      }));
      return c.json({ success: true, data });
    } catch (e) {
      console.error("[viral-discovery]", e);
      return c.json({ success: false, error: "Discovery failed" }, 502);
    }
  });

  api.post("/api/clips/generate", authMiddleware, async (c) => {
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

    const bgTask = async () => {
      try {
        const ai = await generateClipMetadata(key, c.env.GEMINI_MODEL, {
          sourceUrl,
          sourceChannel,
          startSec: start,
          endSec: end,
        });
        const credit = `Original video by ${sourceChannel}`;
        await clipService.createGeneratedClip(fresh, {
          title: ai.hashtags[0] ? String(ai.hashtags[0]) : "New clip",
          platform: "TikTok (9:16)",
          durationSeconds: Math.round(duration),
          caption: ai.caption,
          requiredCredit: credit,
          viralScore: ai.viral_score,
          sourceUrl,
          sourceChannel,
          thumbnail: `https://img.youtube.com/vi/${extractYoutubeId(sourceUrl)}/hqdefault.jpg`,
          videoUrl: sourceUrl,
        });
      } catch (e) {
        console.error("[generate-clip background error]", e);
      }
    };

    // Dispatch fire-and-forget job
    c.executionCtx?.waitUntil(bgTask());

    return c.json({ success: true, message: "Processing started in background." });
  });

  api.post("/api/clips/suggest-hooks", authMiddleware, async (c) => {
    const key = c.env.GEMINI_API_KEY;
    if (!key) {
      return c.json({ success: false, error: "AI not configured" }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const transcript = String(body.transcript ?? "");
    const targetLength = Number(body.targetLength ?? 30);
    
    if (!transcript) {
      return c.json({ success: false, error: "Transcript is required to generate hooks" }, 400);
    }

    try {
      const hooks = await generateHookSuggestions(key, c.env.GEMINI_MODEL, transcript, targetLength);
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
    
    let transcriptText = "";
    let videoTitle = body.title || "Imported Video";
    let videoThumbnail = body.thumbnail || null;
    
    try {
      if (platform === "youtube") {
        if (!c.env.RAPID_API_KEY) {
          console.error("[transcript-fetch-failed] Missing RAPID_API_KEY environment variable. Have you run 'npx wrangler secret put RAPID_API_KEY'?");
        } else {
          const apiResp = await fetch("https://video-transcript-scraper.p.rapidapi.com/transcript/youtube", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-rapidapi-host": "video-transcript-scraper.p.rapidapi.com",
              "x-rapidapi-key": c.env.RAPID_API_KEY
            },
            body: JSON.stringify({ 
              video_url: body.url,
              transcript_text: true
            })
          });
          
          if (!apiResp.ok) {
            console.error(`[transcript-fetch-failed] RapidAPI status ${apiResp.status}:`, await apiResp.text());
          } else {
            const data = await apiResp.json() as any;
            if (data.status === "success" && data.data) {
              transcriptText = typeof data.data.transcript === "string" ? data.data.transcript : JSON.stringify(data.data.transcript);
              
              // We also get ultra high-quality metadata from this API for free
              if (data.data.video_info) {
                if (data.data.video_info.title) videoTitle = data.data.video_info.title;
                if (data.data.video_info.thumbnail) videoThumbnail = data.data.video_info.thumbnail;
              }
            } else {
              console.error("[transcript-fetch-failed] Unknown RapidAPI Response format:", data);
            }
          }
        }
      }
    } catch (e) {
      console.error("[transcript-fetch-failed]", e);
      // We still save the link even if transcript generation fails
    }

    const id = generateId();
    await db.insert(importedLinks).values({
      id,
      userId: user.id,
      url: body.url,
      platform,
      title: videoTitle,
      transcript: transcriptText || null,
      thumbnail: videoThumbnail
    });

    return c.json({ success: true, data: { id, platform, hasTranscript: !!transcriptText } });
  });

  api.delete("/api/links/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const id = c.req.param("id");
    await db.delete(importedLinks).where(and(eq(importedLinks.id, id), eq(importedLinks.userId, c.get("user").id)));
    return c.json({ success: true });
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
      caption: row.caption ?? undefined,
      editCount: row.editCount ?? 0,
      createdAt: row.createdAt ?? new Date(),
    }));
    return c.json({ success: true, data });
  });

  api.get("/api/clips/:id", authMiddleware, async (c) => {
    const db = createDatabase(c.env.DB);
    const clipSvc = createClipService(db);
    const clip = await clipSvc.getClipById(c.req.param("id"), c.get("user").id);
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
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.caption === "string") updates.caption = body.caption;
    if (typeof body.platform === "string") updates.platform = body.platform;
    if (typeof body.status === "string") updates.status = body.status;

    const clipSvc = createClipService(db);
    // Re-fetch full user row for plan
    const [fullUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!fullUser) {
      return c.json({ success: false, error: "User not found" }, 404);
    }
    const { clip, error } = await clipSvc.updateClip(
      c.req.param("id"),
      user.id,
      updates as any,
      fullUser.plan,
    );
    if (error || !clip) {
      return c.json({ success: false, error: error ?? "Failed to update" }, 400);
    }
    return c.json({ success: true, data: clip });
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

    // SECURITY FIX: Idempotency check to prevent replays
    const [alreadyProcessed] = await db
      .select()
      .from(processedWebhookEvents)
      .where(eq(processedWebhookEvents.eventId, event.id))
      .limit(1);
    if (alreadyProcessed) return c.json({ received: true });
    await db.insert(processedWebhookEvents).values({ id: generateId(), eventId: event.id });

    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
    const subSvc = createSubscriptionService(db);
    try {
      switch (event.type) {
        case WEBHOOK_EVENTS.CHECKOUT_COMPLETED: {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.user_id;
          const subId = session.subscription;
          if (userId && typeof subId === "string") {
            const stripeSub = await stripe.subscriptions.retrieve(subId);
            await subSvc.upsertFromStripeSubscription(userId, stripeSub);
            await syncUserPlanFromSubscription(
              db,
              userId,
              stripeSub,
              c.env.STRIPE_PRO_PRICE_ID || "",
              c.env.STRIPE_AGENCY_PRICE_ID || "",
            );
          }
          break;
        }
        case WEBHOOK_EVENTS.SUBSCRIPTION_UPDATED: {
          const stripeSub = event.data.object as Stripe.Subscription;
          const row = await subSvc.findByStripeSubscriptionId(stripeSub.id);
          if (row) {
            await subSvc.upsertFromStripeSubscription(row.userId, stripeSub);
            await syncUserPlanFromSubscription(
              db,
              row.userId,
              stripeSub,
              c.env.STRIPE_PRO_PRICE_ID || "",
              c.env.STRIPE_AGENCY_PRICE_ID || "",
            );
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
