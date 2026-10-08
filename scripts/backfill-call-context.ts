/**
 * Backfill reaction flag + alpha (migration 090) onto historical
 * source_call_outcomes rows. Same math as the live writer (profile-updater.ts):
 *   pre_move_pct / pre_move_z / is_reaction  ← reactionFields(preMoveFromBars(...))
 *   benchmark_return_pct  ← SPY (equity) / BTC (crypto) entry bar → exit close, direction-adjusted
 *   alpha_pct             ← return_pct - benchmark_return_pct
 * One 2y daily-bar fetch per ticker (cached), so this is ~1 Yahoo call per ticker,
 * not per row. Only directional (bullish/bearish) rows with an entry_date are touched.
 *
 * DRY-RUN by default (prints a summary + sample). Pass --apply to write.
 *
 *   JUNTO_SUPABASE_URL=.. JUNTO_SUPABASE_SERVICE_KEY=.. npx tsx scripts/backfill-call-context.ts [--limit N] [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import {
  classifyTicker, yahooSymbol, fetchDailyBars, entryBarIndex, preMoveFromBars,
  reactionFields, benchmarkTicker, closeAtOrBefore, type DailyBars,
} from '../src/lib/prices';

const URL = process.env.JUNTO_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.JUNTO_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APPLY = process.argv.includes('--apply');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : Infinity; })();
const sb = createClient(URL, KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const now = Math.floor(Date.now() / 1000);
const barCache = new Map<string, DailyBars | null>();
async function bars(ticker: string): Promise<DailyBars | null> {
  if (barCache.has(ticker)) return barCache.get(ticker)!;
  const sym = yahooSymbol(ticker);
  const b = sym ? await fetchDailyBars(sym, now - 2 * 365 * 86_400, now + 86_400) : null;
  barCache.set(ticker, b);
  await sleep(80);
  return b;
}

async function main() {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('source_call_outcomes')
      .select('id, ticker, stance, entry_date, exit_date, return_pct')
      .in('stance', ['bullish', 'bearish'])
      .not('entry_date', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const todo = rows.slice(0, LIMIT);
  console.log(`rows=${rows.length} processing=${todo.length} ${APPLY ? '(APPLY)' : '(DRY RUN)'}`);

  let done = 0, priced = 0, reactions = 0, withAlpha = 0, alphaSum = 0;
  const samples: string[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  for (const row of todo) {
    done++;
    const sign = row.stance === 'bullish' ? 1 : -1;
    const b = await bars(row.ticker);
    if (!b) continue;
    const idx = entryBarIndex(b, classifyTicker(row.ticker), row.entry_date);
    if (idx < 0) continue;
    const ctx = reactionFields(preMoveFromBars(b, idx), sign);
    if (ctx.pre_move_pct == null) continue;
    priced++;
    if (ctx.is_reaction) reactions++;

    let benchmark_return_pct: number | null = null;
    const bmT = benchmarkTicker(row.ticker);
    const bmBars = bmT ? await bars(bmT) : null;
    if (bmT && bmBars && row.exit_date) {
      const bi = entryBarIndex(bmBars, classifyTicker(bmT), row.entry_date);
      const exit = closeAtOrBefore(bmBars, Math.floor(new Date(row.exit_date).getTime() / 1000));
      if (bi >= 0 && exit != null) benchmark_return_pct = (exit / bmBars.c[bi] - 1) * 100 * sign;
    }
    const ret = row.return_pct != null ? Number(row.return_pct) : null;
    const alpha_pct = ret != null && benchmark_return_pct != null ? ret - benchmark_return_pct : null;
    if (alpha_pct != null) { withAlpha++; alphaSum += alpha_pct; }

    if (ctx.is_reaction && samples.length < 10) {
      samples.push(`${row.ticker} ${row.stance} ${String(row.entry_date).slice(0, 10)}: pre ${ctx.pre_move_pct.toFixed(1)}% z=${ctx.pre_move_z?.toFixed(2)} ret ${ret?.toFixed(1)}% alpha ${alpha_pct?.toFixed(1)}%`);
    }
    updates.push({ id: row.id, patch: { ...ctx, benchmark_return_pct, alpha_pct } });
    if (done % 200 === 0) process.stdout.write(`\r  ${done}/${todo.length} priced=${priced} reactions=${reactions}   `);
  }

  if (APPLY) {
    let written = 0;
    for (let i = 0; i < updates.length; i += 10) {
      await Promise.all(updates.slice(i, i + 10).map(async (u) => {
        const { error } = await sb.from('source_call_outcomes').update(u.patch).eq('id', u.id);
        if (error) console.warn('update failed', u.id, error.message); else written++;
      }));
    }
    console.log(`\nwritten=${written}`);
  }

  console.log(`\n--- backfill-call-context ${APPLY ? '(APPLIED)' : '(DRY RUN)'} ---`);
  console.log(`seen=${done} priced=${priced} reactions=${reactions} (${priced ? ((reactions / priced) * 100).toFixed(1) : 0}%) alpha_rows=${withAlpha} avg_alpha=${withAlpha ? (alphaSum / withAlpha).toFixed(2) : '-'}%`);
  console.log('reaction samples:\n  ' + samples.join('\n  '));
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
