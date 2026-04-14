/**
 * ViralTrim API client — talks to Cloudflare Worker `/api/*`.
 */

function getBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.replace(/\/$/, "");
  }
  return "";
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface User {
  id: string;
  email: string;
  username?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  stripeCustomerId?: string | null;
  plan?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  status: string;
  planName?: string | null;
  planInterval?: "month" | "year" | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
}

export interface Price {
  id: string;
  unitAmount: number | null;
  currency: string;
  recurring?: { interval: "month" | "year" } | null;
  product?: { name: string; description?: string | null } | null;
}

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  invoicePdf?: string | null;
  createdAt: Date;
}

export interface Clip {
  id: string;
  title: string;
  platform: string;
  duration?: string;
  status: string;
  views?: string;
  engagement?: string;
  thumbnail?: string;
  videoUrl?: string;
  createdAt: Date;
}

export interface ScheduledPost {
  id: string;
  clipTitle: string;
  platform: string;
  scheduledFor: Date;
  status: string;
  thumbnail?: string;
}

export interface UsageSummary {
  used: number;
  limit: number;
  remaining: number;
  plan: string;
}

export interface AffiliateStats {
  referralCode: string;
  totalClicks: number;
  totalConversions: number;
  activeReferrals: number;
  lifetimeEarnings: number;
  pendingPayout: number;
}

export interface ViralVideo {
  id: string;
  title: string;
  url: string;
  views: string;
  engagement: string;
  viralScore: number;
  category: string;
  thumbnail: string;
  duration: string;
}

export interface ClipSuggestion {
  id: string;
  title: string;
  startTime: string;
  duration: string;
  viralScore: number;
  thumbnail: string;
  concept: string;
}

type RequestInitSubset = Omit<RequestInit, "body"> & { body?: BodyInit | null };

async function requestJson<T>(
  path: string,
  init: RequestInitSubset = {},
): Promise<ApiResponse<T>> {
  const base = getBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  try {
    const res = await fetch(url, { ...init, headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      return { success: false, error: text || res.statusText || "Invalid response" };
    }
    const obj = parsed as ApiResponse<T> & { received?: boolean };
    if (!res.ok && obj && typeof obj === "object" && "success" in obj && obj.success === false) {
      return { success: false, error: obj.error || res.statusText };
    }
    if (!res.ok) {
      return {
        success: false,
        error: (obj as ApiResponse<T>)?.error || res.statusText || `HTTP ${res.status}`,
      };
    }
    if (obj && typeof obj === "object" && "success" in obj) {
      return obj as ApiResponse<T>;
    }
    return { success: true, data: parsed as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, error: message };
  }
}

function parseDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date();
}

export const api = {

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return requestJson<User>("/api/auth/me", { method: "GET" });
  },

  async login(email: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    const res = await requestJson<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return res;
  },

  async register(
    email: string,
    password: string,
    displayName?: string,
    companyName?: string,
    phoneNumber?: string,
  ): Promise<ApiResponse<{ user: User; token: string }>> {
    let referralCode: string | undefined;
    try {
      referralCode = localStorage.getItem("viraltrim_ref") ?? undefined;
    } catch {
      referralCode = undefined;
    }
    const res = await requestJson<{ user: User; token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        displayName,
        companyName,
        phoneNumber,
        agreeToTerms: true,
        referralCode,
      }),
    });
    return res;
  },

  async logout(): Promise<void> {
    await requestJson("/api/auth/logout", { method: "POST" });
  },

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    return requestJson<User>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async getViralDiscovery(category: string): Promise<ApiResponse<ViralVideo[]>> {
    const q = new URLSearchParams();
    if (category.trim()) {
      q.set("category", category.trim());
    }
    return requestJson<ViralVideo[]>(`/api/viral-discovery?${q.toString()}`, {
      method: "GET",
    });
  },

  async getClips(): Promise<ApiResponse<Clip[]>> {
    const res = await requestJson<Record<string, unknown>[]>("/api/clips", { method: "GET" });
    if (res.success && res.data) {
      res.data = res.data.map((row) => ({
        ...row,
        createdAt: parseDate(row.createdAt),
      })) as unknown as Clip[];
    }
    return res as ApiResponse<Clip[]>;
  },

  async getScheduledPosts(): Promise<ApiResponse<ScheduledPost[]>> {
    const res = await requestJson<Record<string, unknown>[]>("/api/scheduled-posts", {
      method: "GET",
    });
    if (res.success && res.data) {
      res.data = res.data.map((row) => ({
        ...row,
        scheduledFor: parseDate(row.scheduledFor),
      })) as unknown as ScheduledPost[];
    }
    return res as ApiResponse<ScheduledPost[]>;
  },

  async getRecentActivity(): Promise<ApiResponse<{ id: string; type: string; title: string; createdAt: Date }[]>> {
    const res = await requestJson<Record<string, unknown>[]>("/api/dashboard/activity", {
      method: "GET",
    });
    if (res.success && res.data) {
      res.data = res.data.map((row) => ({
        ...row,
        createdAt: parseDate(row.createdAt),
      })) as unknown as { id: string; type: string; title: string; createdAt: Date }[];
    }
    return res as ApiResponse<{ id: string; type: string; title: string; createdAt: Date }[]>;
  },

  async getUsage(): Promise<ApiResponse<UsageSummary>> {
    return requestJson<UsageSummary>("/api/dashboard/usage", { method: "GET" });
  },

  async getAffiliateStats(): Promise<ApiResponse<AffiliateStats>> {
    return requestJson<AffiliateStats>("/api/affiliate/stats", { method: "GET" });
  },

  async getSubscription(): Promise<ApiResponse<Subscription | null>> {
    const res = await requestJson<Record<string, unknown> | null>("/api/billing/subscription", {
      method: "GET",
    });
    if (res.success && res.data && typeof res.data === "object") {
      const s = res.data as Record<string, unknown>;
      res.data = {
        id: String(s.id),
        userId: String(s.userId),
        status: String(s.status),
        planName: s.planName != null ? String(s.planName) : null,
        planInterval: (s.planInterval as "month" | "year" | null) ?? null,
        currentPeriodEnd: s.currentPeriodEnd ? parseDate(s.currentPeriodEnd) : null,
        cancelAtPeriodEnd: Boolean(s.cancelAtPeriodEnd),
      };
    }
    return res as ApiResponse<Subscription | null>;
  },

  async getPrices(): Promise<ApiResponse<Price[]>> {
    return requestJson<Price[]>("/api/billing/prices", { method: "GET" });
  },

  async getPayments(): Promise<ApiResponse<Payment[]>> {
    const res = await requestJson<Record<string, unknown>[]>("/api/billing/payments", {
      method: "GET",
    });
    if (res.success && res.data) {
      res.data = res.data.map((p) => ({
        ...p,
        createdAt: parseDate(p.createdAt),
      })) as unknown as Payment[];
    }
    return res as ApiResponse<Payment[]>;
  },

  async createCheckout(
    priceId: string,
    trialDays?: number,
    quantity?: number,
  ): Promise<ApiResponse<{ url: string }>> {
    return requestJson<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ priceId, trialDays, quantity }),
    });
  },

  async createPayment(
    priceId: string,
    quantity?: number,
  ): Promise<ApiResponse<{ url: string }>> {
    return api.createCheckout(priceId, undefined, quantity);
  },

  async openPortal(): Promise<ApiResponse<{ url: string }>> {
    return requestJson<{ url: string }>("/api/billing/portal", { method: "POST" });
  },

  async generateClip(body: {
    source_url: string;
    source_channel: string;
    requested_start_seconds: number;
    requested_end_seconds: number;
  }): Promise<ApiResponse<Clip>> {
    const res = await requestJson<Record<string, unknown>>("/api/clips/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (res.success && res.data) {
      const row = res.data as Record<string, unknown>;
      res.data = { ...row, createdAt: parseDate(row.createdAt) } as unknown as Clip;
    }
    return res as ApiResponse<Clip>;
  },

  async chatbot(message: string, history: { role: string; content: string }[]): Promise<ApiResponse<{ reply: string }>> {
    return requestJson<{ reply: string }>("/api/chatbot", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    });
  },
};
