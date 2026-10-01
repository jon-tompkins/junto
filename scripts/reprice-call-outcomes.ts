/**
 * Re-price historical source_call_outcomes after the entry anchor changed from
 * session OPEN → session CLOSE (fetchPriceAtOrAfter). Recomputes entry_price,
 * return_pct and outcome EXACTLY as the live writer does (profile-updater.ts):
 *   return_pct = ((exit - entry)/entry)*100*sign   (bullish +1 / bearish -1)
 *   outcome: null/non-directional → unscored; >0.5 win; <-0.5 loss; else flat
 * exit_price is kept as recorded (a point-in-time close we can't re-fetch).
 *
 * DRY-RUN by default (prints delta summary + sample). Pass --apply to write.
 * Cached by (ticker, entry-day) + throttled so Yahoo isn't hammered.
 *
 *   JUNTO_SUPABASE_URL=.. JUNTO_SUPABASE_SERVICE_KEY=.. npx tsx scripts/reprice-call-outcomes.ts [--limit N] [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { fetchPriceAtOrAfter } from '../src/lib/prices';

const URL = process.env.JUNTO_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.JUNTO_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APPLY = process.argv.includes('--apply');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : Infinity; })();
const sb = createClient(URL, KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const priceCache = new Map<string, number | null>();
async function entryClose(ticker: string, entryDate: string): Promise<number | null> {
  const key = `${ticker}|${entryDate.slice(0, 10)}`;
  if (priceCache.has(key)) return priceCache.get(key)!;
  const p = await fetchPriceAtOrAfter(ticker, entryDate);
  priceCache.set(key, p);
  await sleep(120);
  return p;
}

function deriveOutcome(return_pct: number | null, directional: boolean): string {
  if (return_pct == null || !directional) return 'unscored';
  if (return_pct > 0.5) return 'win';
  if (return_pct < -0.5) return 'loss';
  return 'flat';
}

async function main() {
  let from = 0;
  const PAGE = 500;
  let seen = 0, repriced = 0, flips = 0, unpriceable = 0;
  let retBefore = 0, retAfter = 0, retCount = 0;
  const samples: string[] = [];

  for (;;) {
    if (seen >= LIMIT) break;
    const { data, error } = await sb
      .from('source_call_outcomes')
      .select('id, ticker, stance, entry_date, entry_price, exit_price, return_pct, outcome')
      .not('entry_date', 'is', null)
      .not('exit_price', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      if (seen >= LIMIT) break;
      seen++;
      const sign = row.stance === 'bullish' ? 1 : row.stance === 'bearish' ? -1 : 0;
      const directional = sign !== 0;
      const newEntry = await entryClose(row.ticker, row.entry_date);
      if (newEntry == null || newEntry === 0) { unpriceable++; continue; }
      const newReturn = row.exit_price != null ? ((row.exit_price - newEntry) / newEntry) * 100 * sign : null;
      const newOutcome = deriveOutcome(newReturn, directional);

      const entryChanged = row.entry_price == null || Math.abs(newEntry - row.entry_price) / (row.entry_price || newEntry) > 0.001;
      if (!entryChanged) continue;
      repriced++;
      if (newOutcome !== row.outcome) flips++;
      if (row.return_pct != null && newReturn != null) { retBefore += row.return_pct; retAfter += newReturn; retCount++; }
      if (samples.length < 12) {
        samples.push(`${row.ticker} ${row.stance} ${String(row.entry_date).slice(0,10)}: entry ${row.entry_price}→${newEntry.toFixed(2)} | ret ${row.return_pct?.toFixed(1)}%→${newReturn?.toFixed(1)}% | ${row.outcome}→${newOutcome}`);
      }
      if (APPLY) {
        await sb.from('source_call_outcomes').update({ entry_price: newEntry, return_pct: newReturn, outcome: newOutcome }).eq('id', row.id);
      }
    }
    from += PAGE;
    process.stdout.write(`\r  processed ${seen}, repriced ${repriced}, flips ${flips}, unpriceable ${unpriceable}   `);
  }

  console.log('\n--- reprice-call-outcomes', APPLY ? '(APPLIED)' : '(DRY RUN)', '---');
  console.log(`seen=${seen} repriced=${repriced} outcome_flips=${flips} unpriceable=${unpriceable}`);
  if (retCount) console.log(`avg return among repriced: ${(retBefore / retCount).toFixed(2)}% → ${(retAfter / retCount).toFixed(2)}% (n=${retCount})`);
  console.log('samples:\n  ' + samples.join('\n  '));
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
