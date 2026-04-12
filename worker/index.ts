import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./core-utils";
import { userRoutes } from "./userRoutes";

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
  console.error("[worker]", err);
  return c.json({ success: false, error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

export default app;
