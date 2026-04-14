import { eq } from "drizzle-orm";
import type { Database } from "../index";
import { affiliateReferrals, affiliates, tosAgreements, users, type User } from "../schema";
import { generateId, hashPassword, verifyPassword } from "../../auth";

export interface RegisterData {
  email: string;
  password: string;
  displayName?: string;
  companyName?: string;
  phoneNumber?: string;
  agreeToTerms?: boolean;
  referralCode?: string;
  ipAddress?: string | null;
}

export interface LoginData {
  email: string;
  password: string;
}

function referralCodeFromInput(code: string | undefined): string | null {
  if (!code || typeof code !== "string") {
    return null;
  }
  const t = code.trim();
  return t.length > 0 ? t : null;
}

export class UserService {
  constructor(private db: Database) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    const [row] = await this.db.select().from(users).where(eq(users.email, normalized)).limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async register(data: RegisterData): Promise<{ user: User | null; error?: string }> {
    const normalizedEmail = data.email?.toLowerCase().trim();
    if (!normalizedEmail || !data.password) {
      return { user: null, error: "Email and password are required" };
    }
    if (data.agreeToTerms !== true) {
      return { user: null, error: "You must accept the Terms of Service" };
    }
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      return { user: null, error: "An account with this email already exists" };
    }
    const passwordHash = await hashPassword(data.password);
    const userId = generateId();
    const [user] = await this.db
      .insert(users)
      .values({
        id: userId,
        email: normalizedEmail,
        displayName: data.displayName?.trim() || normalizedEmail.split("@")[0] || "Creator",
        companyName: data.companyName?.trim() || null,
        phoneNumber: data.phoneNumber?.trim() || null,
        passwordHash,
        provider: "email",
        providerId: userId,
        isActive: true,
        plan: "free",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!user) {
      return { user: null, error: "Registration failed" };
    }
    await this.db.insert(tosAgreements).values({
      id: generateId(),
      userId: user.id,
      agreedAt: new Date(),
      ipAddress: data.ipAddress ?? undefined,
      tosVersion: "1.0",
    });
    const ref = referralCodeFromInput(data.referralCode);
    if (ref) {
      const [aff] = await this.db.select().from(affiliates).where(eq(affiliates.referralCode, ref)).limit(1);
      if (aff && aff.userId !== user.id) {
        await this.db
          .insert(affiliateReferrals)
          .values({
            id: generateId(),
            affiliateId: aff.id,
            referredUserId: user.id,
            status: "pending",
          })
          .onConflictDoNothing();
      }
    }
    await this.ensureAffiliateRow(user.id);
    return { user };
  }

  async ensureAffiliateRow(userId: string): Promise<void> {
    const [existing] = await this.db.select().from(affiliates).where(eq(affiliates.userId, userId)).limit(1);
    if (existing) {
      return;
    }
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toLowerCase();
    await this.db
      .insert(affiliates)
      .values({
        id: generateId(),
        userId,
        referralCode: code,
      })
      .onConflictDoNothing();
  }

  async login(data: LoginData): Promise<{ user: User | null; error?: string }> {
    const normalizedEmail = data.email?.toLowerCase().trim();
    if (!normalizedEmail || !data.password) {
      return { user: null, error: "Email and password are required" };
    }
    const user = await this.findByEmail(normalizedEmail);
    if (!user || !user.passwordHash) {
      return { user: null, error: "Invalid email or password" };
    }
    if (user.isBanned) {
      return { user: null, error: "Account suspended" };
    }
    const ok = await verifyPassword(data.password, user.passwordHash);
    if (!ok) {
      return { user: null, error: "Invalid email or password" };
    }
    await this.db
      .update(users)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    const fresh = await this.findById(user.id);
    return { user: fresh };
  }

  async updateProfile(
    userId: string,
    patch: { displayName?: string; avatarUrl?: string | null },
  ): Promise<{ user: User | null; error?: string }> {
    const [updated] = await this.db
      .update(users)
      .set({
        ...("displayName" in patch && patch.displayName !== undefined
          ? { displayName: patch.displayName }
          : {}),
        ...("avatarUrl" in patch ? { avatarUrl: patch.avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return { user: updated ?? null };
  }

  async setStripeCustomerId(userId: string, customerId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async setAvatarUrl(userId: string, url: string): Promise<void> {
    await this.db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, userId));
  }
}

export function createUserService(db: Database): UserService {
  return new UserService(db);
}
