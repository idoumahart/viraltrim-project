/**
 * Cloudflare Worker bindings and environment variables.
 */
export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;

  JWT_SECRET: string;
  SESSION_TTL: string;
  APP_URL: string;
  ALLOWED_ORIGINS: string;

  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_PRICE_ID: string;
  STRIPE_AGENCY_PRICE_ID: string;

  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;

  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  RESEND_ADMIN_EMAIL: string;
  RENDERER_URL: string;
  INTERNAL_WEBHOOK_SECRET: string;
}
