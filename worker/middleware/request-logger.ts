import type { Context, Next } from "hono";
import type { Env } from "../core-utils";
import { createDatabase } from "../database";
import { requestLogs } from "../database/schema";

/**
 * Generate a short request ID for correlating logs.
 */
function reqId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function persistLog(
  c: Context<{ Bindings: Env }>,
  id: string,
  method: string,
  path: string,
  status: number,
  duration: number,
  ip: string,
  error?: string
) {
  const db = createDatabase(c.env.DB);
  const userId = (c as any).get?.("user")?.id;
  const insert = db.insert(requestLogs).values({
    reqId: id,
    method,
    path,
    status,
    durationMs: duration,
    ip,
    userId: userId || null,
    error: error || null,
  });
  c.executionCtx?.waitUntil(
    insert.catch((e) => {
      console.error(JSON.stringify({ level: "error", source: "request-logger", message: "Failed to persist log", error: e?.message }));
    })
  );
}

/**
 * Comprehensive request logging middleware.
 * Logs every request entry, env validation, and any uncaught errors.
 * Also persists logs to D1 for SRE dashboard analysis.
 */
export async function requestLogger(c: Context<{ Bindings: Env }>, next: Next) {
  const id = reqId();
  c.set("reqId" as never, id);
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const ip =
    c.req.raw.headers.get("cf-connecting-ip") ||
    c.req.raw.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  console.log(
    JSON.stringify({
      level: "info",
      reqId: id,
      phase: "start",
      method,
      path,
      ip,
    })
  );

  try {
    await next();
    const duration = Date.now() - start;
    const status = c.res?.status ?? 0;
    console.log(
      JSON.stringify({
        level: status >= 400 ? "warn" : "info",
        reqId: id,
        phase: "complete",
        method,
        path,
        status,
        durationMs: duration,
      })
    );
    persistLog(c, id, method, path, status, duration, ip);
  } catch (err: any) {
    const duration = Date.now() - start;
    const errorMsg = err?.message || String(err);
    console.error(
      JSON.stringify({
        level: "error",
        reqId: id,
        phase: "error",
        method,
        path,
        durationMs: duration,
        error: errorMsg,
        stack: err?.stack,
      })
    );
    persistLog(c, id, method, path, 500, duration, ip, errorMsg);
    throw err; // Re-throw so Hono's onError handler can return a 500
  }
}

/**
 * Logs and catches errors from fire-and-forget background tasks
 * (e.g. c.executionCtx.waitUntil).
 */
export function logBackgroundTask<T>(
  label: string,
  reqId: string,
  promise: Promise<T>
): Promise<T> {
  return promise.catch((err: any) => {
    console.error(
      JSON.stringify({
        level: "error",
        reqId,
        phase: "background",
        task: label,
        error: err?.message || String(err),
        stack: err?.stack,
      })
    );
    throw err;
  });
}
