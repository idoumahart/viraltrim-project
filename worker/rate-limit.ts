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
