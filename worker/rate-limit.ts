const CHAT_IP_LIMIT = 20;
const CHAT_EMAIL_LIMIT = 30;
const CHAT_GLOBAL_LIMIT = 500;
const CHAT_WINDOW_SEC = 3600;

export async function checkChatbotRateLimit(
  cache: KVNamespace,
  ip: string,
  email?: string
): Promise<{ allowed: boolean; reason?: string }> {
  // IP-based limit
  const ipKey = `chatbot:ip:${ip}`;
  const ipRaw = await cache.get(ipKey);
  const ipN = ipRaw ? Number.parseInt(ipRaw, 10) : 0;
  if (Number.isFinite(ipN) && ipN >= CHAT_IP_LIMIT) {
    return { allowed: false, reason: "ip_limit" };
  }

  // Email-based limit (stricter for identified users)
  if (email) {
    const emailKey = `chatbot:email:${email.toLowerCase()}`;
    const emailRaw = await cache.get(emailKey);
    const emailN = emailRaw ? Number.parseInt(emailRaw, 10) : 0;
    if (Number.isFinite(emailN) && emailN >= CHAT_EMAIL_LIMIT) {
      return { allowed: false, reason: "email_limit" };
    }
  }

  // Global limit (safety valve)
  const globalKey = `chatbot:global`;
  const globalRaw = await cache.get(globalKey);
  const globalN = globalRaw ? Number.parseInt(globalRaw, 10) : 0;
  if (Number.isFinite(globalN) && globalN >= CHAT_GLOBAL_LIMIT) {
    return { allowed: false, reason: "global_limit" };
  }

  // Increment all counters
  const ipNext = Number.isFinite(ipN) ? ipN + 1 : 1;
  await cache.put(ipKey, String(ipNext), { expirationTtl: CHAT_WINDOW_SEC });

  if (email) {
    const emailKey = `chatbot:email:${email.toLowerCase()}`;
    const emailRaw = await cache.get(emailKey);
    const emailN = emailRaw ? Number.parseInt(emailRaw, 10) : 0;
    const emailNext = Number.isFinite(emailN) ? emailN + 1 : 1;
    await cache.put(emailKey, String(emailNext), { expirationTtl: CHAT_WINDOW_SEC });
  }

  const globalNext = Number.isFinite(globalN) ? globalN + 1 : 1;
  await cache.put(globalKey, String(globalNext), { expirationTtl: CHAT_WINDOW_SEC });

  return { allowed: true };
}

// Very strict rate limit for login and registration mapping IP addresses
const AUTH_LIMIT = 10;
const AUTH_WINDOW_SEC = 900; // 15 mins

export async function checkAuthRateLimit(cache: KVNamespace, ip: string): Promise<boolean> {
  const key = `auth:ip:${ip}`;
  const raw = await cache.get(key);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isFinite(n) && n >= AUTH_LIMIT) {
    return false;
  }
  const next = Number.isFinite(n) ? n + 1 : 1;
  await cache.put(key, String(next), { expirationTtl: AUTH_WINDOW_SEC });
  return true;
}

// IP Bucket rate limiting for API usage to prevent mass abuse
const API_LIMIT = 50; 
const API_WINDOW_SEC = 3600; // 1 hour

export async function checkApiRateLimit(cache: KVNamespace, ip: string): Promise<boolean> {
  const key = `api:ip:${ip}`;
  const raw = await cache.get(key);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isFinite(n) && n >= API_LIMIT) {
    return false;
  }
  const next = Number.isFinite(n) ? n + 1 : 1;
  await cache.put(key, String(next), { expirationTtl: API_WINDOW_SEC });
  return true;
}
