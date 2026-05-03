import type { Hono } from "hono";
import { createDatabase } from "./database";
import { requestLogs, sreAdmins } from "./database/schema";
import { eq, sql, and, gte, lte, like } from "drizzle-orm";
import type { AppEnv } from "./types/app-env";

async function requireSreAdmin(c: any) {
  const user = c.get("user");
  if (!user?.email) {
    return { allowed: false, response: c.json({ success: false, error: "Unauthorized" }, 401) };
  }
  const db = createDatabase(c.env.DB);
  const admin = await db.select().from(sreAdmins).where(eq(sreAdmins.email, user.email)).limit(1);
  if (!admin.length) {
    return { allowed: false, response: c.json({ success: false, error: "Forbidden" }, 403) };
  }
  return { allowed: true, admin: admin[0] };
}

export function registerSreRoutes(api: Hono<AppEnv>) {
  // Public health check
  api.get("/api/sre/health", async (c) => {
    const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {};

    // D1 check
    const d1Start = Date.now();
    try {
      const db = createDatabase(c.env.DB);
      await db.select({ count: sql`count(*)` }).from(requestLogs);
      checks.d1 = { ok: true, latencyMs: Date.now() - d1Start };
    } catch (e: any) {
      checks.d1 = { ok: false, latencyMs: Date.now() - d1Start, error: e.message };
    }

    // KV check
    const kvStart = Date.now();
    try {
      await c.env.CACHE.put("_health", "ok", { expirationTtl: 60 });
      await c.env.CACHE.get("_health");
      checks.kv = { ok: true, latencyMs: Date.now() - kvStart };
    } catch (e: any) {
      checks.kv = { ok: false, latencyMs: Date.now() - kvStart, error: e.message };
    }

    // R2 check
    const r2Start = Date.now();
    try {
      await c.env.MEDIA.head("_health");
      checks.r2 = { ok: true, latencyMs: Date.now() - r2Start };
    } catch (e: any) {
      // head may 404 which is fine — means R2 is reachable
      if (e.message?.includes("404") || e.message?.includes("NotFound")) {
        checks.r2 = { ok: true, latencyMs: Date.now() - r2Start };
      } else {
        checks.r2 = { ok: false, latencyMs: Date.now() - r2Start, error: e.message };
      }
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    return c.json({
      success: true,
      status: allOk ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    }, allOk ? 200 : 503);
  });

  // GET /api/sre/logs — paginated request logs
  api.get("/api/sre/logs", async (c) => {
    const auth = await requireSreAdmin(c);
    if (!auth.allowed) return auth.response;

    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
    const offset = parseInt(c.req.query("offset") || "0", 10);
    const statusFilter = c.req.query("status");
    const pathFilter = c.req.query("path");
    const from = c.req.query("from");
    const to = c.req.query("to");

    const db = createDatabase(c.env.DB);
    const conditions = [];
    if (statusFilter) conditions.push(eq(requestLogs.status, parseInt(statusFilter, 10)));
    if (pathFilter) conditions.push(like(requestLogs.path, `%${pathFilter}%`));
    if (from) conditions.push(gte(requestLogs.createdAt, new Date(from)));
    if (to) conditions.push(lte(requestLogs.createdAt, new Date(to)));

    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(requestLogs)
      .where(where)
      .orderBy(sql`${requestLogs.id} DESC`)
      .limit(limit)
      .offset(offset);

    const countRes = await db
      .select({ count: sql`count(*)` })
      .from(requestLogs)
      .where(where);
    const total = Number(countRes[0]?.count || 0);

    return c.json({ success: true, logs: rows, total, limit, offset });
  });

  // GET /api/sre/stats — aggregate stats
  api.get("/api/sre/stats", async (c) => {
    const auth = await requireSreAdmin(c);
    if (!auth.allowed) return auth.response;

    const hours = Math.min(parseInt(c.req.query("hours") || "24", 10), 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const db = createDatabase(c.env.DB);

    const totalRes = await db
      .select({ count: sql`count(*)`, avgDuration: sql`avg(${requestLogs.durationMs})` })
      .from(requestLogs)
      .where(gte(requestLogs.createdAt, since));

    const errorRes = await db
      .select({ count: sql`count(*)`, avgDuration: sql`avg(${requestLogs.durationMs})` })
      .from(requestLogs)
      .where(and(gte(requestLogs.createdAt, since), sql`${requestLogs.status} >= 500`));

    const statusBreakdown = await db
      .select({ status: requestLogs.status, count: sql`count(*)` })
      .from(requestLogs)
      .where(gte(requestLogs.createdAt, since))
      .groupBy(requestLogs.status);

    const p95Res = await db
      .select({ p95: sql`approx_quantile(${requestLogs.durationMs}, 0.95)` })
      .from(requestLogs)
      .where(gte(requestLogs.createdAt, since));

    return c.json({
      success: true,
      periodHours: hours,
      totalRequests: Number(totalRes[0]?.count || 0),
      avgDurationMs: Math.round(Number(totalRes[0]?.avgDuration || 0)),
      errorCount: Number(errorRes[0]?.count || 0),
      errorRatePct: totalRes[0]?.count
        ? Math.round((Number(errorRes[0]?.count || 0) / Number(totalRes[0].count)) * 1000) / 10
        : 0,
      p95DurationMs: Math.round(Number(p95Res[0]?.p95 || 0)),
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s.status,
        count: Number(s.count),
      })),
    });
  });

  // GET /api/sre/admins
  api.get("/api/sre/admins", async (c) => {
    const auth = await requireSreAdmin(c);
    if (!auth.allowed) return auth.response;

    const db = createDatabase(c.env.DB);
    const rows = await db.select().from(sreAdmins).orderBy(sreAdmins.createdAt);
    return c.json({ success: true, admins: rows });
  });

  // POST /api/sre/admins
  api.post("/api/sre/admins", async (c) => {
    const auth = await requireSreAdmin(c);
    if (!auth.allowed) return auth.response;

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim() || null;
    const role = body.role === "viewer" ? "viewer" : "admin";

    if (!email || !email.includes("@")) {
      return c.json({ success: false, error: "Valid email required" }, 400);
    }

    const db = createDatabase(c.env.DB);
    const id = crypto.randomUUID();
    try {
      await db.insert(sreAdmins).values({ id, email, name, role });
      return c.json({ success: true, data: { id, email, role } });
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) {
        return c.json({ success: false, error: "Admin already exists" }, 409);
      }
      console.error("[sre/admins]", e);
      return c.json({ success: false, error: "Failed to add admin" }, 500);
    }
  });
}
