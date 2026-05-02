import type { Context, Next } from "hono";
import type { Env } from "../core-utils";

/**
 * Generate a short request ID for correlating logs.
 */
function reqId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Comprehensive request logging middleware.
 * Logs every request entry, env validation, and any uncaught errors.
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
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(
      JSON.stringify({
        level: "error",
        reqId: id,
        phase: "error",
        method,
        path,
        durationMs: duration,
        error: err?.message || String(err),
        stack: err?.stack,
      })
    );
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
