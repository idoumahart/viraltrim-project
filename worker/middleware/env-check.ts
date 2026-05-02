import type { Env } from "../core-utils";

const REQUIRED: Array<{ key: keyof Env; label: string }> = [
  { key: "JWT_SECRET", label: "JWT_SECRET" },
  { key: "DB", label: "D1 Database (DB)" },
];

const WARN_IF_MISSING: Array<{ key: keyof Env; label: string }> = [
  { key: "RESEND_API_KEY", label: "RESEND_API_KEY" },
  { key: "STRIPE_SECRET_KEY", label: "STRIPE_SECRET_KEY" },
  { key: "GEMINI_API_KEY", label: "GEMINI_API_KEY" },
  { key: "ELEVENLABS_API_KEY", label: "ELEVENLABS_API_KEY" },
  { key: "PEXELS_API_KEY", label: "PEXELS_API_KEY" },
  { key: "RENDERER_URL", label: "RENDERER_URL" },
  { key: "YOUTUBE_API_KEY", label: "YOUTUBE_API_KEY" },
];

/**
 * Validates critical environment bindings on Worker startup.
 * Logs loudly if anything required is missing.
 */
export function validateEnv(env: Env): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const { key, label } of REQUIRED) {
    const val = env[key];
    if (val === undefined || val === null || val === "") {
      missing.push(label);
      console.error(
        JSON.stringify({
          level: "fatal",
          source: "env-check",
          message: `Missing REQUIRED environment variable/binding: ${label}`,
        })
      );
    }
  }

  for (const { key, label } of WARN_IF_MISSING) {
    const val = env[key];
    if (val === undefined || val === null || val === "") {
      console.warn(
        JSON.stringify({
          level: "warn",
          source: "env-check",
          message: `Missing optional environment variable: ${label} — related features will be unavailable`,
        })
      );
    }
  }

  if (missing.length === 0) {
    console.log(
      JSON.stringify({
        level: "info",
        source: "env-check",
        message: "All required environment bindings present",
      })
    );
  }

  return { ok: missing.length === 0, missing };
}
