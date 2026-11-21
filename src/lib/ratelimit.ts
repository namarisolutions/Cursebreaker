import Redis from "ioredis";

/**
 * Fixed-window rate limiter. Uses Railway Redis when REDIS_URL is set,
 * otherwise an in-process map (fine for dev or a single replica).
 * Keys are agent ids or fixed buckets, never IP addresses.
 */
const g = globalThis as unknown as {
  redis?: Redis;
  rlMem?: Map<string, { n: number; reset: number }>;
};

function redis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  // family: 0 lets ioredis resolve Railway's IPv6 private network hostnames.
  g.redis ??= new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, family: 0 });
  return g.redis;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = `rl:${key}:${Math.floor(nowSec / windowSec)}`;
  const retryAfter = windowSec - (nowSec % windowSec);
  const r = redis();
  let n: number;
  if (r) {
    const res = await r.multi().incr(bucket).expire(bucket, windowSec).exec();
    n = Number(res?.[0]?.[1] ?? 0);
  } else {
    const mem = (g.rlMem ??= new Map());
    const cur = mem.get(bucket);
    if (!cur || cur.reset < Date.now()) {
      if (mem.size > 10_000) mem.clear();
      mem.set(bucket, { n: 1, reset: Date.now() + windowSec * 1000 });
      n = 1;
    } else n = ++cur.n;
  }
  return { ok: n <= limit, retryAfter };
}
