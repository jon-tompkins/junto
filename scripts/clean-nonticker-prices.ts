/**
 * One-off cleanup for themes that were priced as an unrelated instrument
 * ("AI" → C3.ai, "GOLD" → Gold.com, "AGI" → Alamos Gold, …). Applies the SAME rule
 * the live paths now use (isPriceable + isPriceableInstrument in src/lib/prices.ts):
 *
 *   open positions   → null entry/mark/alpha/reaction fields in source_positions and
 *                      strip entry_price/entry_at/entry_tweet_id from the profile blob
 *   closed outcomes  → outcome='unscored', return/alpha/benchmark/reaction/prices nulled
 *                      (the row itself is kept — append-only call log)
 *
 * A closed call has no asset_class of its own, so it inherits the source's current
 * position label for that ticker, else the majority label across all sources.
 *
 * DRY-RUN by default. Pass --apply to write.
 *   JUNTO_SUPABASE_URL=.. JUNTO_SUPABASE_SERVICE_KEY=.. npx tsx scripts/clean-nonticker-prices.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import {
  classifyTicker, yahooSymbol, fetchDailyBars, isPriceable, isPriceableInstrument, type AssetClass,
} from '../src/lib/prices';

const URL = process.env.JUNTO_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.JUNTO_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APPLY = process.argv.includes('--apply');
const sb = createClient(URL, KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function all<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const now = Math.floor(Date.now() / 1000);
const typeCache = new Map<string, string | null>();
async function instrumentType(ticker: string): Promise<string | null> {
  if (typeCache.has(ticker)) return typeCache.get(ticker)!;
  const sym = yahooSymbol(ticker);
  const bars = sym ? await fetchDailyBars(sym, now - 10 * 86_400, now + 86_400) : null;
  const t = bars?.instrumentType ?? null;
  typeCache.set(ticker, t);
  await sleep(80);
  return t;
}

// Full rule. Only 'sector' positions need the network (ETF check).
async function priceable(ticker: string, cls: AssetClass): Promise<boolean> {
  if (!isPriceable(ticker, cls)) return false;
  if (cls !== 'sector') return true;
  return isPriceableInstrument(cls, await instrumentType(ticker));
}

interface Pos { source_id: string; ticker: string; asset_class: AssetClass; entry_price: number | null; mark_price: number | null }
interface Out { id: string; source_id: string; ticker: string; outcome: string | null; entry_price: number | null; return_pct: number | null }

async function main() {
  const positions = await all<Pos>('source_positions', 'source_id, ticker, asset_class, entry_price, mark_price');
  const outcomes = await all<Out>('source_call_outcomes', 'id, source_id, ticker, outcome, entry_price, return_pct');

  const own = new Map<string, AssetClass>();
  const votes = new Map<string, Map<string, number>>();
  for (const p of positions) {
    own.set(`${p.source_id}|${p.ticker}`, p.asset_class);
    const v = votes.get(p.ticker) ?? new Map<string, number>();
    v.set(String(p.asset_class), (v.get(String(p.asset_class)) ?? 0) + 1);
    votes.set(p.ticker, v);
  }
  const majority = (ticker: string): AssetClass => {
    const v = votes.get(ticker);
    if (!v) return null;
    const top = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return top === 'null' || top === 'undefined' ? null : (top as AssetClass);
  };

  // ── open positions ──
  const badPos: Pos[] = [];
  for (const p of positions) {
    if (p.entry_price == null && p.mark_price == null) continue;
    if (!(await priceable(p.ticker, p.asset_class))) badPos.push(p);
  }
  // ── closed outcomes ──
  const badOut: Out[] = [];
  for (const o of outcomes) {
    if (o.entry_price == null && o.return_pct == null && (o.outcome ?? 'unscored') === 'unscored') continue;
    if (classifyTicker(o.ticker) === 'theme') { badOut.push(o); continue; }
    const cls = own.has(`${o.source_id}|${o.ticker}`) ? own.get(`${o.source_id}|${o.ticker}`)! : majority(o.ticker);
    if (!(await priceable(o.ticker, cls))) badOut.push(o);
  }

  const tally = (xs: { ticker: string }[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x.ticker, (m.get(x.ticker) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(', ');
  };
  console.log(`positions scanned=${positions.length} mispriced=${badPos.length}`);
  console.log(`  ${tally(badPos)}`);
  const scored = badOut.filter((o) => o.outcome === 'win' || o.outcome === 'loss').length;
  console.log(`outcomes scanned=${outcomes.length} mispriced=${badOut.length} (scored win/loss: ${scored})`);
  console.log(`  ${tally(badOut)}`);

  if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); return; }

  let posWritten = 0;
  for (const p of badPos) {
    const { error } = await sb.from('source_positions').update({
      entry_price: null, mark_price: null, mark_return_pct: null, benchmark_return_pct: null,
      mark_alpha_pct: null, pre_move_pct: null, pre_move_z: null, is_reaction: null,
    }).eq('source_id', p.source_id).eq('ticker', p.ticker);
    if (error) console.warn('position update failed', p.source_id, p.ticker, error.message); else posWritten++;
  }
  // Profile blob is what profile-updater reads back as `prev` — strip the entry there too.
  let blobs = 0;
  const bySource = new Map<string, string[]>();
  for (const p of badPos) bySource.set(p.source_id, [...(bySource.get(p.source_id) ?? []), p.ticker]);
  for (const [source_id, tickers] of bySource) {
    const { data, error } = await sb.from('source_analyst_profiles').select('positions').eq('source_id', source_id).maybeSingle();
    if (error || !data?.positions) continue;
    const blob = data.positions as Record<string, Record<string, unknown>>;
    let changed = false;
    for (const t of tickers) {
      const e = blob[t];
      if (!e) continue;
      for (const k of ['entry_price', 'entry_at', 'entry_tweet_id']) if (k in e) { delete e[k]; changed = true; }
    }
    if (!changed) continue;
    const u = await sb.from('source_analyst_profiles').update({ positions: blob }).eq('source_id', source_id);
    if (u.error) console.warn('blob update failed', source_id, u.error.message); else blobs++;
  }
  let outWritten = 0;
  for (let i = 0; i < badOut.length; i += 10) {
    await Promise.all(badOut.slice(i, i + 10).map(async (o) => {
      const { error } = await sb.from('source_call_outcomes').update({
        outcome: 'unscored', return_pct: null, entry_price: null, exit_price: null,
        alpha_pct: null, benchmark_return_pct: null, pre_move_pct: null, pre_move_z: null, is_reaction: null,
      }).eq('id', o.id);
      if (error) console.warn('outcome update failed', o.id, error.message); else outWritten++;
    }));
  }
  console.log(`\nAPPLIED: positions=${posWritten} profile blobs=${blobs} outcomes=${outWritten}`);
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
