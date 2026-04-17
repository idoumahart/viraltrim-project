const CHAT_LIMIT = 20;
const CHAT_WINDOW_SEC = 3600;

export async function checkChatbotRateLimit(cache: KVNamespace, ip: string): Promise<boolean> {
  const key = `chatbot:ip:${ip}`;
  const raw = await cache.get(key);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isFinite(n) && n >= CHAT_LIMIT) {
    return false;
  }
  const next = Number.isFinite(n) ? n + 1 : 1;
  await cache.put(key, String(next), { expirationTtl: CHAT_WINDOW_SEC });
  return true;
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
