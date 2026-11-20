/** PostgREST's default max-rows. `/api/health` currently selects tweets with no explicit limit. */
export const HEALTH_TWEET_ROW_CAP = 1000;

export const DEFAULT_LEADERBOARD_BUDGET_MS = 3000;

/**
 * When the 24h tweet count is exactly the row cap, the figure is not a real
 * total. Warn only — a separate change lifts the cap.
 */
export function healthTweetCapWarning(count: number): string | null {
  if (count !== HEALTH_TWEET_ROW_CAP) return null;
  return (
    `tweets_last_24h.count is exactly ${HEALTH_TWEET_ROW_CAP}. ` +
    'The health endpoint reads content_twitter with no explicit row limit, so this is the ' +
    'PostgREST default max-rows cap. The reported 24h count is capped and may under-count ' +
    'the real volume. A parallel change fixes the cap; this check only warns.'
  );
}

export type LoadFlag = 'pass' | 'warn' | 'fail';

/** Leaderboard is slower than the budget today (~7s). Default mode is warn, not fail. */
export function flagSlowLoad(loadMs: number, budgetMs: number, mode: 'warn' | 'fail'): LoadFlag {
  if (!Number.isFinite(loadMs) || loadMs < 0) {
    throw new Error('loadMs must be a non-negative finite number');
  }
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new Error('budgetMs must be a positive finite number');
  }
  if (loadMs <= budgetMs) return 'pass';
  return mode;
}
