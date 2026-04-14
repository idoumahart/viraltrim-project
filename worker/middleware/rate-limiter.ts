export async function checkAuthRateLimit(cache: any, ip: string): Promise<boolean> {
  const key = `rate-limit:auth:${ip}`;
  const record = await cache.get(key, "json");
  const now = Date.now();
  
  if (!record) {
    await cache.put(key, JSON.stringify({ count: 1, resetAt: now + 15 * 60 * 1000 }), { expirationTtl: 15 * 60 });
    return true;
  }
  
  const { count, resetAt } = record as { count: number; resetAt: number };
  if (now > resetAt) {
    await cache.put(key, JSON.stringify({ count: 1, resetAt: now + 15 * 60 * 1000 }), { expirationTtl: 15 * 60 });
    return true;
  }
  
  if (count >= 5) {
    return false;
  }
  
  await cache.put(key, JSON.stringify({ count: count + 1, resetAt }), { expirationTtl: Math.max(60, Math.floor((resetAt - now) / 1000)) });
  return true;
}
