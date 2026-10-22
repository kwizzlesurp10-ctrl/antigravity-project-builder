export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

interface BucketEntry {
  timestamps: number[];
}

const MAX_TRACKED_KEYS = 5_000;
const buckets = new Map<string, BucketEntry>();

export function resolveClientIdentifier(request: Request, fallback = 'anonymous'): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  return realIp || fallback;
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfterSeconds) }),
  };
}

export function checkSlidingWindowRateLimit(
  identifier: string,
  maxRequests = 60,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (buckets.size >= MAX_TRACKED_KEYS && !buckets.has(identifier)) {
    for (const [key, entry] of buckets.entries()) {
      if (entry.timestamps.every((ts) => ts <= windowStart)) {
        buckets.delete(key);
      }
    }
  }

  const existing = buckets.get(identifier) ?? { timestamps: [] };
  const activeTimestamps = existing.timestamps.filter((ts) => ts > windowStart);

  if (activeTimestamps.length >= maxRequests) {
    buckets.set(identifier, { timestamps: activeTimestamps });
    const resetAtMs = (activeTimestamps[0] ?? now) + windowMs;
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
    };
  }

  activeTimestamps.push(now);
  buckets.set(identifier, { timestamps: activeTimestamps });
  const resetAtMs = (activeTimestamps[0] ?? now) + windowMs;

  return {
    allowed: true,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - activeTimestamps.length),
    resetAtMs,
    retryAfterSeconds: 0,
  };
}
