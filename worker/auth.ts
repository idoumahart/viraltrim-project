import * as jose from "jose";
import { and, eq, gt } from "drizzle-orm";
import type { Database } from "./database";
import { apiKeys, sessions, users, type User } from "./database/schema";

export function generateId(): string {
  return crypto.randomUUID();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `${Buffer.from(salt).toString("hex")}:${Buffer.from(hash).toString("hex")}`;
}

export async function verifyPassword(password: string, hashStr: string): Promise<boolean> {
  try {
    const [saltHex, originalHashHex] = hashStr.split(":");
    if (!saltHex || !originalHashHex) return false;
    
    const salt = new Uint8Array(Buffer.from(saltHex, "hex"));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    const newHashHex = Buffer.from(hash).toString("hex");
    return newHashHex === originalHashHex;
  } catch {
    return false;
  }
}

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateToken(
  user: User,
  sessionId: string,
  jwtSecret: string,
  ttlSeconds: number,
): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);
  return await new jose.SignJWT({
    sub: user.id,
    sid: sessionId,
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function createSession(
  db: Database,
  userId: string,
  req: Request,
  jwtSecret: string,
  sessionTtlSeconds: number,
): Promise<{ token: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error("User not found");
  }
  const sessionId = generateId();
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);
  const token = await generateToken(user, sessionId, jwtSecret, sessionTtlSeconds);
  const tokenHash = await hashToken(token);
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    tokenHash,
    userAgent: req.headers.get("user-agent") ?? undefined,
    ipAddress:
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined,
    expiresAt,
  });
  return { token };
}

export async function validateSession(
  db: Database,
  token: string,
  jwtSecret: string,
): Promise<{ user: User } | null> {
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret);
    const sid = typeof payload.sid === "string" ? payload.sid : "";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sid || !sub) {
      return null;
    }
    const now = new Date();
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sid),
          eq(sessions.userId, sub),
          eq(sessions.isRevoked, false),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);
    if (!session) {
      return null;
    }
    const th = await hashToken(token);
    if (th !== session.tokenHash) {
      return null;
    }
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user || user.isBanned || user.isActive === false) {
      return null;
    }
    return { user };
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) {
    return null;
  }
  const t = h.slice(7).trim();
  return t.length > 0 ? t : null;
}

export async function revokeSession(db: Database, token: string, jwtSecret: string): Promise<void> {
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret);
    const sid = typeof payload.sid === "string" ? payload.sid : "";
    if (!sid) {
      return;
    }
    await db
      .update(sessions)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(eq(sessions.id, sid));
  } catch {
    try {
      const decoded = jose.decodeJwt(token) as { sid?: string };
      const sid = decoded.sid;
      if (typeof sid === "string" && sid) {
        await db
          .update(sessions)
          .set({ isRevoked: true, revokedAt: new Date() })
          .where(eq(sessions.id, sid));
      }
    } catch {
      /* ignore */
    }
  }
}

// ─── API Key Auth (Headless / Mobile App Support) ─────────────────────────────

/**
 * Generates a new API key for a user.
 * Returns the raw key (shown to user once) and the stored hash.
 * Format: vt_<32 random bytes hex> — recognizable prefix, 64 chars of entropy.
 */
export async function generateApiKey(): Promise<{ raw: string; hash: string }> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const raw = `vt_${hex}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return { raw, hash };
}

/**
 * Validates a raw API key from a Bearer token.
 * Hashes the incoming key and looks it up in D1.
 * Updates last_used_at on success for audit purposes.
 * Returns { user } if valid, null otherwise.
 */
export async function validateApiKey(db: Database, rawKey: string): Promise<{ user: User } | null> {
  try {
    // Only attempt API key validation for keys with our prefix — avoids extra D1 query for JWTs
    if (!rawKey.startsWith("vt_")) return null;

    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isRevoked, false)))
      .limit(1);

    if (!keyRecord) return null;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, keyRecord.userId))
      .limit(1);

    if (!user || user.isBanned || user.isActive === false) return null;

    // Update last_used_at asynchronously — don't block the request
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id))
      .catch(() => { /* non-critical */ });

    return { user };
  } catch {
    return null;
  }
}

