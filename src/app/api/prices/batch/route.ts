import { NextRequest, NextResponse } from 'next/server';
import { fetchCurrentPrice } from '@/lib/prices';

export const maxDuration = 60;

// Short-lived in-memory price cache so the trades board (and repeat loads) don't
// re-hit Yahoo for every ticker on every request. TTL keeps it fresh enough for
// a "best trades" view that doesn't need tick-level accuracy.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { price: number | null; at: number }>();

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);

async function priceFor(ticker: string): Promise<number | null> {
  const key = ticker.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.price;
  // Cap each fetch so one slow ticker can't stall the whole batch near the limit.
  const price = await withTimeout(fetchCurrentPrice(key).catch(() => null), 4000, null);
  cache.set(key, { price, at: Date.now() });
  return price;
}

// Run tasks with a bounded concurrency so a few hundred tickers don't open a few
// hundred simultaneous Yahoo connections (which get throttled).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// POST /api/prices/batch  { symbols: string[] }  → { prices: { [ticker]: number|null } }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols : [];
    const uniq = Array.from(new Set(symbols.map((s) => String(s).toUpperCase().trim()).filter(Boolean))).slice(0, 600);
    if (uniq.length === 0) return NextResponse.json({ prices: {} });

    const results = await mapLimit(uniq, 16, priceFor);
    const prices: Record<string, number | null> = {};
    uniq.forEach((t, idx) => { prices[t] = results[idx]; });
    return NextResponse.json({ prices });
  } catch (err) {
    console.error('[POST /api/prices/batch]', err);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
