import { getSupabase } from '@/lib/db/client';
import {
  classifyTicker, yahooSymbol, fetchDailyBars, entryBarIndex, preMoveFromBars,
  reactionFields, benchmarkTicker, type DailyBars,
} from '@/lib/prices';

/**
 * Mark every OPEN directional analyst position to market so smart-money scoring
 * can count open calls (leaderboard.ts weights them below closed calls). One daily
 * Yahoo fetch per distinct ticker covers entry bar, pre-call move and latest close.
 * Return math mirrors closed calls: stored entry_price → latest close, × stance sign.
 */
export async function markOpenPositions(opts: { concurrency?: number } = {}) {
  const concurrency = opts.concurrency ?? 8;
  const supabase = getSupabase();

  const positions: Array<{ source_id: string; ticker: string; stance: string; since: string | null; entry_price: number | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('source_positions')
      .select('source_id, ticker, stance, since, entry_price')
      .in('stance', ['bullish', 'bearish'])
      .not('entry_price', 'is', null)
      .not('since', 'is', null)
      .range(from, from + 999);
    if (error) throw error;
    positions.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const now = Math.floor(Date.now() / 1000);
  const earliest = positions.reduce((m, p) => Math.min(m, new Date(p.since!).getTime() / 1000), now);
  const period1 = Math.floor(earliest) - 100 * 86_400; // covers the pre-move vol window
  const bars = new Map<string, DailyBars | null>();
  const tickers = [...new Set([...positions.map((p) => p.ticker), 'SPY', 'BTC'])].filter((t) => yahooSymbol(t));
  for (let i = 0; i < tickers.length; i += concurrency) {
    await Promise.all(
      tickers.slice(i, i + concurrency).map(async (t) => {
        bars.set(t, await fetchDailyBars(yahooSymbol(t)!, period1, now + 86_400));
      }),
    );
  }

  const updates: Array<{ source_id: string; ticker: string; patch: Record<string, unknown> }> = [];
  for (const p of positions) {
    const b = bars.get(p.ticker);
    const entry = Number(p.entry_price);
    if (!b || b.c.length === 0 || !entry) continue;
    const sign = p.stance === 'bullish' ? 1 : -1;
    const idx = entryBarIndex(b, classifyTicker(p.ticker), p.since!);
    const mark = b.c[b.c.length - 1];
    const mark_return_pct = (mark / entry - 1) * 100 * sign;

    let benchmark_return_pct: number | null = null;
    const bmT = benchmarkTicker(p.ticker);
    const bm = bmT ? bars.get(bmT) : null;
    if (bmT && bm && bm.c.length) {
      const bi = entryBarIndex(bm, classifyTicker(bmT), p.since!);
      if (bi >= 0) benchmark_return_pct = (bm.c[bm.c.length - 1] / bm.c[bi] - 1) * 100 * sign;
    }

    updates.push({
      source_id: p.source_id,
      ticker: p.ticker,
      patch: {
        mark_price: mark,
        mark_return_pct,
        benchmark_return_pct,
        mark_alpha_pct: benchmark_return_pct != null ? mark_return_pct - benchmark_return_pct : null,
        ...reactionFields(idx >= 0 ? preMoveFromBars(b, idx) : null, sign),
        marked_at: new Date().toISOString(),
      },
    });
  }

  let written = 0, failed = 0;
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(
      updates.slice(i, i + 10).map(async (u) => {
        const { error } = await supabase
          .from('source_positions')
          .update(u.patch)
          .eq('source_id', u.source_id)
          .eq('ticker', u.ticker);
        if (error) failed++;
        else written++;
      }),
    );
  }
  return { positions: positions.length, tickers: tickers.length, marked: updates.length, written, failed };
}
