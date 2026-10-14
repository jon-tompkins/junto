import { getSupabase } from '@/lib/db/client';
import { AMBIGUOUS_TICKERS } from '@/lib/prices';

/**
 * History-aware dispatches (Oct 2026). The dispatch writer used to see only the last
 * 48h of tweets, so it couldn't say who has held a view for months, who just changed
 * their mind, or how a call has gone since. This builds those facts DETERMINISTICALLY
 * from the call log (source_positions + source_call_outcomes) and hands them to the
 * writer as a TRACKED HISTORY block — the model never computes a date or a return.
 *
 * `checkHistoryClaims` then verifies the finished dispatch against the same facts: a
 * prototype run had the model call a view "flipped" when the log only showed when it
 * was first recorded.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FLIP_WINDOW_DAYS = 14;
const MAX_STANDING_LINES = 24;
const MIN_SCORED_FOR_RECORD = 8;

export interface SourceHistory {
  block: string;
  /** Dates ("May 28") that appear in the block — the only history dates the writer may use. */
  dates: Set<string>;
  /** "+78%" style returns that appear in the block. */
  returns: Set<string>;
  /** handle|TICKER pairs that genuinely changed stance (the only ones that may be called a flip). */
  turned: Set<string>;
  /** handle|TICKER → the dates that belong to that view (since / turned / changed). */
  datesByView: Map<string, Set<string>>;
  lines: number;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso).getTime()) / 86_400_000);
const fmtPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x))}%`;
const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const MAX_CHANGES = 6;
const MAX_CHANGES_PER_ACCOUNT = 2;

interface Position {
  source_id: string; ticker: string; stance: string; since: string | null;
  conviction: number | null; mark_return_pct: number | null; aliases: string[] | null;
}

// Names written lowercase as often as not ("eth", "bitcoin"), so matched case-insensitively.
const CASE_FREE = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'HYPE', 'AAVE', 'LINK', 'AVAX', 'SUI', 'ZEC']);
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which tracked names come up in today's input, and how often. Crypto accounts rarely
 * use cashtags ("bitcoin h1", "eth looks heavy"), so beyond $CASHTAGS this matches each
 * tracked position's ticker as a word and its stored aliases (BTC ↔ "Bitcoin").
 */
export function tickerWeightsFrom(texts: string[], positions: { ticker: string; aliases?: string[] | null }[], watchlist: string[] = []): Map<string, number> {
  const patterns = new Map<string, RegExp[]>();
  for (const p of positions) {
    const t = p.ticker;
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(t) || AMBIGUOUS_TICKERS.has(t) || patterns.has(t)) continue;
    const res = [new RegExp(`\\$${esc(t)}\\b`, 'i')];
    if (t.length >= 3) res.push(new RegExp(`\\b${esc(t)}\\b`, CASE_FREE.has(t) ? 'i' : ''));
    for (const a of p.aliases || []) if (a && a.length >= 4) res.push(new RegExp(`\\b${esc(a)}\\b`, 'i'));
    patterns.set(t, res);
  }
  const w = new Map<string, number>();
  for (const text of texts) {
    for (const [t, res] of patterns) if (res.some((re) => re.test(text))) w.set(t, (w.get(t) ?? 0) + 1);
  }
  for (const t of watchlist) { const u = t.toUpperCase(); if (patterns.has(u)) w.set(u, (w.get(u) ?? 0) + 3); }
  return w;
}
interface Outcome {
  source_id: string; ticker: string; stance: string; entry_date: string | null;
  exit_date: string | null; close_reason: string; outcome: string | null;
}

/**
 * @param sourceIds   the dispatch's sources
 * @param handleById  source id → handle
 * @param tickerWeights ticker → how often it came up in today's input (cashtags + watchlist);
 *                    only these names get standing-view lines, most-discussed first
 */
export async function buildSourceHistory(
  sourceIds: string[],
  handleById: Record<string, string>,
  texts: string[],
  watchlist: string[] = [],
): Promise<SourceHistory | null> {
  if (sourceIds.length === 0 || texts.length === 0) return null;
  const supabase = getSupabase();

  const [{ data: posData }, { data: outData }] = await Promise.all([
    supabase
      .from('source_positions')
      .select('source_id, ticker, stance, since, conviction, mark_return_pct, aliases')
      .in('source_id', sourceIds)
      .limit(5000),
    supabase
      .from('source_call_outcomes')
      .select('source_id, ticker, stance, entry_date, exit_date, close_reason, outcome')
      .in('source_id', sourceIds)
      .order('exit_date', { ascending: false })
      .limit(5000),
  ]);
  const positions = (posData || []) as Position[];
  const outcomes = (outData || []) as Outcome[];
  const tickerWeights = tickerWeightsFrom(texts, positions, watchlist);
  if (tickerWeights.size === 0) return null;
  const current = new Map(positions.map((p) => [`${p.source_id}|${p.ticker}`, p]));

  const dates = new Set<string>();
  const returns = new Set<string>();
  const turned = new Set<string>();
  const datesByView = new Map<string, Set<string>>();
  const addViewDate = (h: string, t: string, d: string) => {
    const k = `${h.toLowerCase()}|${t}`;
    datesByView.set(k, (datesByView.get(k) || new Set<string>()).add(d));
  };
  const usedSources = new Set<string>();

  // ── standing views on today's names ──
  const standing: string[] = [];
  const relevant = positions
    .filter((p) => tickerWeights.has(p.ticker) && (p.stance === 'bullish' || p.stance === 'bearish') && p.since && handleById[p.source_id])
    .sort((a, b) => (tickerWeights.get(b.ticker)! - tickerWeights.get(a.ticker)!) || a.ticker.localeCompare(b.ticker) || (a.since! < b.since! ? -1 : 1))
    .slice(0, MAX_STANDING_LINES);
  for (const p of relevant) {
    const h = handleById[p.source_id];
    const since = fmtDate(p.since!);
    // A flip that opened the current stance: the closed call it replaced.
    const prev = outcomes.find(
      (o) => o.source_id === p.source_id && o.ticker === p.ticker && o.close_reason === 'flip' &&
        o.exit_date && o.exit_date.slice(0, 10) >= p.since!.slice(0, 10) && o.stance !== p.stance,
    );
    let line: string;
    if (prev && prev.entry_date) {
      const heldPrev = Math.max(1, daysSince(prev.entry_date) - daysSince(prev.exit_date!));
      line = `- @${h} · $${p.ticker} · ${p.stance} · TURNED ${p.stance} ${since} (was ${prev.stance} for ${dayWord(heldPrev)})`;
      turned.add(`${h.toLowerCase()}|${p.ticker}`);
    } else {
      line = `- @${h} · $${p.ticker} · ${p.stance} · on record since ${since} (${dayWord(daysSince(p.since!))})`;
    }
    dates.add(since);
    addViewDate(h, p.ticker, since);
    if (p.conviction != null) line += ` · conviction ${p.conviction}/5`;
    // Direction-adjusted: how the CALL has done (a bearish call on a falling stock is +).
    if (p.mark_return_pct != null) {
      const v = Number(p.mark_return_pct);
      if (Math.abs(v) < 0.5) line += ' · call flat since';
      else { const r = fmtPct(v); line += ` · call ${r} since`; returns.add(r); }
    }
    standing.push(line);
    usedSources.add(p.source_id);
  }

  // ── changes of mind in the last two weeks, on today's names ──
  const changes: string[] = [];
  const perAccount = new Map<string, number>();
  for (const o of outcomes) {
    if (changes.length >= MAX_CHANGES) break;
    if (o.close_reason !== 'flip' || !o.exit_date || !o.entry_date) continue;
    if (daysSince(o.exit_date) > FLIP_WINDOW_DAYS || !tickerWeights.has(o.ticker)) continue;
    const now = current.get(`${o.source_id}|${o.ticker}`);
    const h = handleById[o.source_id];
    if (!h || !now || now.stance === o.stance) continue;
    if ((perAccount.get(h) ?? 0) >= MAX_CHANGES_PER_ACCOUNT) continue; // don't let one account fill the list
    perAccount.set(h, (perAccount.get(h) ?? 0) + 1);
    const held = Math.max(1, daysSince(o.entry_date) - daysSince(o.exit_date));
    const when = fmtDate(o.exit_date);
    changes.push(`- @${h} · $${o.ticker} · ${o.stance} → ${now.stance} on ${when} (after ${dayWord(held)} ${o.stance})`);
    dates.add(when);
    addViewDate(h, o.ticker, when);
    turned.add(`${h.toLowerCase()}|${o.ticker}`);
    usedSources.add(o.source_id);
  }

  // ── track records for the accounts that appear above ──
  const tally = new Map<string, { won: number; scored: number }>();
  for (const o of outcomes) {
    if (!usedSources.has(o.source_id) || (o.outcome !== 'win' && o.outcome !== 'loss')) continue;
    const t = tally.get(o.source_id) || { won: 0, scored: 0 };
    t.scored++; if (o.outcome === 'win') t.won++;
    tally.set(o.source_id, t);
  }
  const records = [...tally.entries()]
    .filter(([, t]) => t.scored >= MIN_SCORED_FOR_RECORD)
    .sort((a, b) => b[1].scored - a[1].scored)
    .map(([id, t]) => `- @${handleById[id]}: ${t.won} of ${t.scored} closed calls won`);

  if (standing.length === 0 && changes.length === 0) return null;

  const block = [
    `## TRACKED HISTORY — from myJunto's call log`,
    `How long tracked accounts have held their views, who changed their mind, and how their calls have gone ("call +78% since" = the call's own return, direction-adjusted: a bearish call on a falling name is positive). This is the ONLY allowed source for such facts: never state a date, duration, return-since, change of mind or track record that is not written below. Tracking began in 2026, so say "on record since", never "has believed since".`,
    standing.length ? `\nStanding views on names in today's tweets:\n${standing.join('\n')}` : '',
    changes.length ? `\nChanges of mind in the last ${FLIP_WINDOW_DAYS} days:\n${changes.join('\n')}` : '',
    records.length ? `\nTrack records:\n${records.join('\n')}` : '',
    `\nHow to use it:
- Add history only where it changes how a reader should weigh a view: a long-held view, a fresh change of mind, a call that has gone notably well or badly since, or a lone dissenter against the rest. One short clause, e.g. "(bullish since May 28; the call is up 78%)".
- Only say an account "turned", "flipped" or "changed its mind" on a name when its line above says TURNED or it is in the changes list. An "on record since" line is NOT a change of mind.
- If there is a meaningful change of mind or a lone dissenter on a name you feature, add a short section **Who's Shifted** (2-4 bullets) just before your closing section. If nothing qualifies, leave it out.
- Mention a track record at most twice in the whole dispatch, and only when it changes the read.
- History never earns a name a place in the dispatch on its own; it only adds context to names that belong there.`,
  ].filter(Boolean).join('\n');

  return { block, dates, returns, turned, datesByView, lines: standing.length + changes.length + records.length };
}

// Units a claim lives in: a bullet is one unit (its ticker, handle and date travel
// together); prose is split into sentences.
function segments(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (/^\s*([-*•]|\d+\.)\s/.test(line)) out.push(line);
    else out.push(...line.split(/(?<=[.!?])\s+(?=[A-Z@$*(])/));
  }
  return out;
}

/**
 * Problems with the history claims in a finished dispatch, or [] if it's clean.
 * `inputText` is everything else the writer was given (tweets, prior dispatches), so a
 * date or figure quoted from a tweet is not mistaken for an invented history fact.
 */
export function checkHistoryClaims(output: string, history: SourceHistory, inputText: string): string[] {
  const problems: string[] = [];
  const hay = `${history.block}\n${inputText}`;

  // 1. A history date must exist AND belong to the account + name it's attached to
  //    (a real date from one view pinned on another account's or name's view is wrong).
  const DATE = /\b(?:since|on|from)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2})\b/g;
  const viewsOf = (h: string) => [...history.datesByView.keys()].filter((k) => k.startsWith(`${h}|`));
  for (const seg of segments(output)) {
    const dates = [...seg.matchAll(DATE)].map((m) => m[1].replace(/\./, '').replace(/^([A-Z][a-z]{2})[a-z]*/, '$1'));
    if (!dates.length) continue;
    const handles = [...new Set([...seg.matchAll(/@(\w{1,15})/g)].map((m) => m[1].toLowerCase()))];
    const known = handles.filter((h) => viewsOf(h).length);
    for (const d of dates) {
      if (known.length !== 1) {
        // No single tracked account to pin it on: the date just has to exist somewhere.
        if (!history.dates.has(d) && !hay.includes(d)) problems.push(`unsupported date "${d}"`);
        continue;
      }
      const h = known[0];
      const segTickers = viewsOf(h).map((k) => k.split('|')[1])
        .filter((t) => new RegExp(`(\\$|\\b)${t.replace('.', '\\.')}\\b`, CASE_FREE.has(t) ? 'i' : '').test(seg));
      // A dated claim on a name this account has no recorded view of can't be right.
      const cashtags = [...seg.matchAll(/\$([A-Z]{1,6})\b/g)].map((m) => m[1]);
      if (!segTickers.length && cashtags.length && history.dates.has(d)) {
        problems.push(`@${h} has no recorded view on ${cashtags.map((t) => '$' + t).join('/')} — "${d}" belongs to another view: "${seg.trim().slice(0, 120)}"`);
        continue;
      }
      const candidates = segTickers.length ? segTickers.map((t) => `${h}|${t}`) : viewsOf(h);
      if (!candidates.some((k) => history.datesByView.get(k)?.has(d))) {
        if (history.dates.has(d) || !hay.includes(d)) {
          problems.push(`"${d}" is not a date of @${h}'s view${segTickers.length ? ` on ${segTickers.map((t) => '$' + t).join('/')}` : ''} — "${seg.trim().slice(0, 120)}"`);
        }
      }
    }
  }
  // 2. "+NN% since" must be a return from the history.
  for (const m of output.matchAll(/([+\-−]\s?\d{1,4}(?:\.\d+)?%)\s+since/g)) {
    const r = m[1].replace(/\s/g, '').replace('-', '−');
    const plain = r.replace(/^[+−]/, '');
    if (!history.returns.has(r) && !history.returns.has(r.replace('−', '-')) && !hay.includes(`${plain} since`)) {
      problems.push(`unsupported return "${m[1]} since"`);
    }
  }
  // 2b. "the call is up/down N%" phrasing must also match a recorded return.
  const absReturns = new Set([...history.returns].map((r) => r.replace(/^[+−-]/, '')));
  for (const m of output.matchAll(/\bcall(?:'s| is| has)?\s+(?:been\s+)?(?:up|down)\s+(\d{1,4})%/gi)) {
    if (!absReturns.has(`${m[1]}%`)) problems.push(`unsupported return "${m[0]}"`);
  }
  // 3. Only real changes of mind may be called one.
  const verb = /\b(turn(?:ed|s)|flip(?:ped|s)?|switch(?:ed|es)?|revers(?:ed|es)|chang(?:ed|es) (?:its|their|his|her) mind)\b/i;
  for (const seg of segments(output)) {
    if (!verb.test(seg)) continue;
    const handles = [...seg.matchAll(/@(\w{1,15})/g)].map((m) => m[1].toLowerCase());
    const tickers = [...seg.matchAll(/\$([A-Z]{1,6})\b/g)].map((m) => m[1]);
    if (handles.length !== 1 || tickers.length === 0) continue; // only judge unambiguous claims
    if (!tickers.some((t) => history.turned.has(`${handles[0]}|${t}`))) {
      problems.push(`"${seg.trim().slice(0, 140)}" calls a change of mind the log doesn't show`);
    }
  }
  return problems;
}
