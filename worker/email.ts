import type { Env } from "./core-utils";

export async function sendResendEmail(
  env: Pick<Env, "RESEND_API_KEY" | "RESEND_FROM_EMAIL">,
  to: string | string[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || "hello@viraltrim.com",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  }).catch((err: Error) => {
    console.error("[Resend]", err);
    return null;
  });
  if (!res) {
    return { ok: false, error: "Network error" };
  }
  if (!res.ok) {
    const text = await res.text();
    console.error("[Resend]", res.status, text);
    return { ok: false, error: text || res.statusText };
  }
  return { ok: true };
}

export function welcomeEmailHtml(displayName: string): string {
  const name = displayName || "there";
  return `
  <div style="font-family:system-ui,sans-serif;background:#09090b;color:#fafafa;padding:24px;">
    <h1 style="font-size:24px;">Welcome to viraltrim, ${name}</h1>
    <p>Discover trending clips, edit with AI, and schedule across platforms.</p>
    <p><a href="#" style="color:#0ea5e9;">Open your dashboard</a></p>
  </div>`;
}

export function dmcaAdminHtml(report: Record<string, string>): string {
  return `<pre style="font-family:monospace">${JSON.stringify(report, null, 2)}</pre>`;
}
