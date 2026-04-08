import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60s
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * In-memory rate limiter. Works per serverless instance on Vercel —
 * not globally coordinated, but still effective against burst abuse.
 *
 * @param limit  Max requests per window
 * @param windowMs  Window duration in milliseconds
 */
export function rateLimit(limit: number, windowMs: number) {
  return function check(req: NextRequest): NextResponse | null {
    cleanup();

    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
    const key = `${ip}:${req.nextUrl.pathname}`;
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return null;
    }

    entry.count++;

    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
          },
        }
      );
    }

    return null;
  };
}

// Pre-configured limiters
export const apiLimiter = rateLimit(60, 60_000);       // 60 req/min for general API
export const searchLimiter = rateLimit(30, 60_000);     // 30 req/min for search
export const authLimiter = rateLimit(10, 60_000);       // 10 req/min for auth actions
export const webhookLimiter = rateLimit(100, 60_000);   // 100 req/min for webhooks
