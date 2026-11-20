/** Leaderboard ordering used on the logged-out homepage.
 * Matches the default Score column on /leaderboard: Wilson lower bound,
 * unrated sources (no scored calls) sink, then sample size. */

export interface RankableCaller {
  wilson_score: number;
  scored: number;
  total_positions: number;
  avg_alpha_pct: number | null;
}

export function rankByScore<T extends RankableCaller>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const av = a.scored === 0 ? null : a.wilson_score;
    const bv = b.scored === 0 ? null : b.wilson_score;
    if (av == null && bv == null) return b.total_positions - a.total_positions;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return bv - av;
    return b.scored - a.scored || b.total_positions - a.total_positions;
  });
}

/** Mean return versus the market across the already-ranked top callers.
 * Callers with no benchmark print are left out of the average. */
export function averageOutperformance(rows: { avg_alpha_pct: number | null }[]): number | null {
  const vals = rows
    .map((r) => r.avg_alpha_pct)
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (vals.length === 0) return null;
  return vals.reduce((sum, n) => sum + n, 0) / vals.length;
}
