import { getSupabase } from '@/lib/db/client';

/**
 * Leaderboard data layer, built on the normalized `source_positions` table
 * (migration 083) joined to closed-call outcomes in `source_call_outcomes`.
 *
 * Why two tables? They hold different halves of a track record:
 *   - `source_positions`   — one row per (source_id, ticker) the source CURRENTLY
 *                            holds. Gives us the sample-size gate (how many distinct
 *                            positions we track for a source) and conviction (1–5).
 *   - `source_call_outcomes` — append-only log of calls at the moment they CLOSED
 *                            (flip / drop / stale), scored win/loss with a return.
 *                            This is where "hit rate" actually comes from — an open
 *                            position has no outcome yet.
 *
 * `getSourceHitRates()` gates on tracked-position count (the task's ≥20 rule),
 * ranks by closed-call hit rate, and breaks ties by a conviction-weighted score
 * so that between two equal hit rates the higher-conviction analyst ranks first.
 */

export interface SourceHitRateRow {
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Distinct tracked positions (rows in source_positions) — the sample-size gate. */
  total_positions: number;
  /** Mean conviction (1–5) across the source's current tracked positions. */
  avg_conviction: number | null;
  wins: number;
  losses: number;
  /** Closed directional calls that were scored win/loss (wins + losses). */
  scored: number;
  /** wins / scored, in 0..1. Null when the source has no scored calls yet. */
  hit_rate: number | null;
  avg_return_pct: number | null;
  /** Mean conviction on winning calls whose ticker is still tracked (best-effort). */
  avg_conviction_wins: number | null;
  /** Ranking tiebreak: hit_rate weighted by conviction (0 when unrated). */
  conviction_weighted_score: number;
  /**
   * Wilson lower-bound composite score (z=1.96, n=scored calls).
   * Accounts for sample size — a 3/3 source ranks below a 30/40 source.
   * 0 when scored == 0 so unrated sources always sort to the bottom.
   */
  wilson_score: number;
  /** Share of priced directional calls flagged as reactions (chased a move). Null if none priced. */
  reaction_rate: number | null;
  /** Mean return vs SPY (equity) / BTC (crypto) over the same window, across scored calls. */
  avg_alpha_pct: number | null;
  /** Long-horizon, non-reaction track record that smart-money qualification is judged on. */
  smart: SmartMoneyStats | null;
  /** Passes every SMART_MONEY gate: consistent, benchmark-beating, long-horizon caller. */
  is_smart_money: boolean;
}

/**
 * "Smart money" = analysts making good, CONSISTENT, LONG-TERM calls. Judged only on
 * calls that (a) were held ≥ minHoldDays, (b) weren't reactions to a move that
 * already happened, and (c) were scored win/loss. Return is measured as alpha vs
 * SPY/BTC so a rising tape doesn't make everyone look smart. Calibrated Oct 2026
 * (~59 sources had ≥6 qualifying calls; these gates pass a handful).
 */
export const SMART_MONEY = {
  minHoldDays: 21,
  minCalls: 10,
  minWilson: 0.4,       // hit-rate lower bound — confidently not a coin-flipper
  minPositiveMonthShare: 2 / 3, // alpha positive in ≥ ⅔ of active months…
  minMonths: 2,          // …across at least 2 months
} as const;

export interface SmartMoneyStats {
  calls: number;
  wins: number;
  hit_rate: number;
  wilson: number;
  avg_alpha_pct: number;
  median_alpha_pct: number;
  positive_months: number;
  months: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface SmartCall {
  win: boolean;
  alpha: number;
  month: string; // YYYY-MM of exit
}

/** A closed call's contribution to the smart-money sample, or null if it doesn't qualify. */
export function toSmartCall(o: {
  outcome: string | null;
  entry_date: string | null;
  exit_date: string | null;
  is_reaction: boolean | null;
  alpha_pct: number | string | null;
}): SmartCall | null {
  if ((o.outcome !== 'win' && o.outcome !== 'loss') || o.alpha_pct == null) return null;
  if (o.is_reaction !== false || !o.entry_date || !o.exit_date) return null;
  const held = (new Date(o.exit_date).getTime() - new Date(o.entry_date).getTime()) / 86_400_000;
  if (held < SMART_MONEY.minHoldDays) return null;
  return { win: o.outcome === 'win', alpha: Number(o.alpha_pct), month: o.exit_date.slice(0, 7) };
}

export function smartStats(calls: SmartCall[]): SmartMoneyStats | null {
  if (calls.length === 0) return null;
  const wins = calls.filter((c) => c.win).length;
  const alphas = calls.map((c) => c.alpha);
  const byMonth = new Map<string, number>();
  for (const c of calls) byMonth.set(c.month, (byMonth.get(c.month) ?? 0) + c.alpha);
  return {
    calls: calls.length,
    wins,
    hit_rate: wins / calls.length,
    wilson: wilsonLower(wins, calls.length),
    avg_alpha_pct: alphas.reduce((a, b) => a + b, 0) / alphas.length,
    median_alpha_pct: median(alphas),
    positive_months: [...byMonth.values()].filter((v) => v > 0).length,
    months: byMonth.size,
  };
}

export function isSmartMoney(s: SmartMoneyStats | null): boolean {
  if (!s) return false;
  return (
    s.calls >= SMART_MONEY.minCalls &&
    s.wilson >= SMART_MONEY.minWilson &&
    s.avg_alpha_pct > 0 &&
    s.median_alpha_pct > 0 &&
    s.months >= SMART_MONEY.minMonths &&
    s.positive_months / s.months >= SMART_MONEY.minPositiveMonthShare
  );
}

// Supabase caps a single select at 1000 rows; page through so a busy table
// (many sources × many tickers) isn't silently truncated.
async function fetchAll<T>(
  build: () => any,
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

interface PositionAgg {
  total: number;
  convSum: number;
  convCount: number;
  convByTicker: Map<string, number>; // upper(ticker) -> conviction, for win-conviction join
}

/**
 * Wilson score lower bound for a binomial proportion.
 * z = 1.96 (95% CI). Returns 0 when n == 0 so unscored sources sort to the bottom.
 */
function wilsonLower(wins: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.96;
  const p = wins / n;
  const z2 = z * z;
  return (
    (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) /
    (1 + z2 / n)
  );
}

/**
 * Sources ranked by closed-call hit rate, gated by a minimum number of distinct
 * tracked positions so a source we barely follow can't top the board.
 *
 * @param minPositions Minimum rows in source_positions to qualify (default 20).
 */
export async function getSourceHitRates(minPositions = 20): Promise<SourceHitRateRow[]> {
  const supabase = getSupabase();

  // 1) Aggregate the normalized position table: count + conviction per source.
  const positions = await fetchAll<{
    source_id: string;
    ticker: string;
    conviction: number | null;
  }>(() => supabase.from('source_positions').select('source_id, ticker, conviction'));

  const posAgg = new Map<string, PositionAgg>();
  for (const p of positions) {
    const a =
      posAgg.get(p.source_id) ||
      { total: 0, convSum: 0, convCount: 0, convByTicker: new Map<string, number>() };
    a.total += 1;
    if (p.conviction != null) {
      a.convSum += Number(p.conviction);
      a.convCount += 1;
      a.convByTicker.set(p.ticker.toUpperCase(), Number(p.conviction));
    }
    posAgg.set(p.source_id, a);
  }

  // 2) Closed-call outcomes for ALL sources → the actual hit rate. We fetch these
  //    before gating so a source with a real closed-call record still surfaces even
  //    if it sits just under the tracked-position threshold (going purely on closed
  //    positions is noisy while the outcome log is still thin).
  const outcomes = await fetchAll<{
    source_id: string;
    ticker: string;
    outcome: string;
    return_pct: number | null;
    entry_date: string | null;
    exit_date: string | null;
    is_reaction: boolean | null;
    alpha_pct: number | null;
  }>(() =>
    supabase
      .from('source_call_outcomes')
      .select('source_id, ticker, outcome, return_pct, entry_date, exit_date, is_reaction, alpha_pct'),
  );

  interface OutcomeAgg {
    wins: number;
    losses: number;
    retSum: number;
    retCount: number;
    winConvSum: number;
    winConvCount: number;
    reactions: number;
    reactionPriced: number;
    alphaSum: number;
    alphaCount: number;
    smartCalls: SmartCall[];
  }
  const outAgg = new Map<string, OutcomeAgg>();
  for (const o of outcomes) {
    const a =
      outAgg.get(o.source_id) ||
      {
        wins: 0, losses: 0, retSum: 0, retCount: 0, winConvSum: 0, winConvCount: 0,
        reactions: 0, reactionPriced: 0, alphaSum: 0, alphaCount: 0, smartCalls: [],
      };
    if (o.outcome === 'win') {
      a.wins += 1;
      const conv = posAgg.get(o.source_id)?.convByTicker.get((o.ticker ?? '').toUpperCase());
      if (conv != null) {
        a.winConvSum += conv;
        a.winConvCount += 1;
      }
    } else if (o.outcome === 'loss') {
      a.losses += 1;
    }
    if (o.return_pct != null) {
      a.retSum += Number(o.return_pct);
      a.retCount += 1;
    }
    if (o.is_reaction != null) {
      a.reactionPriced += 1;
      if (o.is_reaction) a.reactions += 1;
    }
    const scoredCall = o.outcome === 'win' || o.outcome === 'loss';
    if (scoredCall && o.alpha_pct != null) {
      a.alphaSum += Number(o.alpha_pct);
      a.alphaCount += 1;
    }
    const sc = toSmartCall(o);
    if (sc) a.smartCalls.push(sc);
    outAgg.set(o.source_id, a);
  }

  // 3) Inclusion gate — a source appears if it either clears the tracked-position
  //    sample gate OR has at least one scored (win/loss) closed call.
  const candidateIds = new Set<string>();
  for (const [id, a] of posAgg) if (a.total >= minPositions) candidateIds.add(id);
  for (const [id, a] of outAgg) if (a.wins + a.losses >= 1) candidateIds.add(id);
  if (candidateIds.size === 0) return [];

  // 4) Source metadata (handle / name / avatar) for the ones we can link to.
  const srcs = await fetchAll<{
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
  }>(() =>
    supabase
      .from('sources')
      .select('id, handle_or_url, display_name, avatar_url')
      .in('id', [...candidateIds]),
  );
  const meta = new Map(srcs.map((s) => [s.id, s]));

  // 5) Assemble rows.
  const rows: SourceHitRateRow[] = [];
  for (const source_id of candidateIds) {
    const m = meta.get(source_id);
    if (!m?.handle_or_url) continue; // only rank sources we can actually link to

    const pa = posAgg.get(source_id) ?? { total: 0, convSum: 0, convCount: 0, convByTicker: new Map<string, number>() };
    const oa = outAgg.get(source_id);
    const wins = oa?.wins ?? 0;
    const losses = oa?.losses ?? 0;
    const scored = wins + losses;
    const hit_rate = scored > 0 ? wins / scored : null;
    const avg_conviction = pa.convCount > 0 ? pa.convSum / pa.convCount : null;
    const smart = smartStats(oa?.smartCalls ?? []);
    const avg_conviction_wins =
      oa && oa.winConvCount > 0 ? oa.winConvSum / oa.winConvCount : null;

    rows.push({
      source_id,
      handle: m.handle_or_url,
      display_name: m.display_name ?? null,
      avatar_url: m.avatar_url ?? null,
      total_positions: pa.total,
      avg_conviction,
      wins,
      losses,
      scored,
      hit_rate,
      avg_return_pct: oa && oa.retCount > 0 ? oa.retSum / oa.retCount : null,
      avg_conviction_wins,
      // Reward both accuracy and conviction; 0 when unrated so rated sources rank first.
      conviction_weighted_score: (hit_rate ?? 0) * (avg_conviction ?? 0),
      wilson_score: wilsonLower(wins, scored),
      reaction_rate: oa && oa.reactionPriced > 0 ? oa.reactions / oa.reactionPriced : null,
      avg_alpha_pct: oa && oa.alphaCount > 0 ? oa.alphaSum / oa.alphaCount : null,
      smart,
      is_smart_money: isSmartMoney(smart),
    });
  }

  // 6) Rank: rated sources by hit rate first; ties broken by the conviction-weighted
  //    score, then by sample size (scored calls, then tracked positions). Sources
  //    with no scored calls yet fall to the bottom, ordered by how much we track them.
  rows.sort((a, b) => {
    const aRated = a.hit_rate != null;
    const bRated = b.hit_rate != null;
    if (aRated !== bRated) return aRated ? -1 : 1;
    if (aRated && bRated) {
      if (b.hit_rate! !== a.hit_rate!) return b.hit_rate! - a.hit_rate!;
      if (b.conviction_weighted_score !== a.conviction_weighted_score)
        return b.conviction_weighted_score - a.conviction_weighted_score;
      if (b.scored !== a.scored) return b.scored - a.scored;
    }
    if (b.total_positions !== a.total_positions) return b.total_positions - a.total_positions;
    return (b.avg_conviction ?? 0) - (a.avg_conviction ?? 0);
  });

  return rows;
}

/**
 * Drill-down: every current position for one source (stance + conviction),
 * highest-conviction first. Backs an optional per-source detail view.
 */
export async function getPositionsForSource(sourceId: string): Promise<Array<{
  ticker: string;
  stance: string;
  conviction: number | null;
  mentions: number;
  since: string | null;
  last_mentioned: string | null;
}>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('source_positions')
    .select('ticker, stance, conviction, mentions, since, last_mentioned')
    .eq('source_id', sourceId)
    .order('conviction', { ascending: false, nullsFirst: false })
    .order('mentions', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{
    ticker: string;
    stance: string;
    conviction: number | null;
    mentions: number;
    since: string | null;
    last_mentioned: string | null;
  }>;
}
