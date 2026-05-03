import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./core-utils";
import { userRoutes } from "./userRoutes";
import { securityHeadersPlugin } from "./middleware/security-headers";
import { requestLogger } from "./middleware/request-logger";
import { validateEnv } from "./middleware/env-check";
import { createDatabase } from "./database";
import { sessions } from "./database/schema";
import { lt } from "drizzle-orm";

export type ClientErrorReport = {
  message: string;
  url: string;
  timestamp: string;
} & Record<string, unknown>;

export * from "./core-utils";

function parseOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return ["http://localhost:3000", "http://127.0.0.1:3000"];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("*", securityHeadersPlugin);
app.use("*", requestLogger);

app.use("*", async (c, next) => {
  const origins = parseOrigins(c.env.ALLOWED_ORIGINS);
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) {
        return origins[0];
      }
      if (origins.includes(origin)) {
        return origin;
      }
      return origins[0];
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

userRoutes(app);

app.onError((err, c) => {
  const reqId = (c.get("reqId" as never) as string) || "unknown";
  console.error(JSON.stringify({
    level: "error",
    reqId,
    source: "onError",
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  }));
  return c.json({ success: false, error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: any) {
    // Validate critical env bindings once per request cold-start
    validateEnv(env);

    // For API routes, let Hono handle the request
    if (new URL(request.url).pathname.startsWith("/api/")) {
      const response = await app.fetch(request, env, ctx);
      return addCoopCoepHeaders(response);
    }

    // For static assets, fetch from ASSETS binding and add COOP/COEP
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      return addCoopCoepHeaders(assetResponse);
    } catch (e: any) {
      console.error(JSON.stringify({
        level: "error",
        source: "assets",
        message: "ASSETS fetch failed",
        error: e?.message || String(e),
        path: new URL(request.url).pathname,
      }));
      return new Response("Asset not found", { status: 404 });
    }
  },
  async scheduled(event: any, env: Env, ctx: any) {
    validateEnv(env);
    const db = createDatabase(env.DB);
    try {
      const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
      console.log(JSON.stringify({
        level: "info",
        source: "cron",
        message: "Session cleanup complete",
        deleted: result?.meta?.changes ?? "unknown",
      }));
    } catch (err: any) {
      console.error(JSON.stringify({
        level: "error",
        source: "cron",
        message: "Failed to cleanup sessions",
        error: err?.message || String(err),
        stack: err?.stack,
      }));
    }
  }
};

function addCoopCoepHeaders(response: Response): Response {
  // COEP/COOP removed from default responses. They were causing:
  // 1. Vercel Live iframe blocks (cross-origin without CORP)
  // 2. Same-origin worker script blocks
  // If browser-side FFmpeg.wasm rendering needs SharedArrayBuffer,
  // these headers can be added conditionally on the specific route.
  return response;
}
