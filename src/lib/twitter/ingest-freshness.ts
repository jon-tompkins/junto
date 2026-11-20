import type { SupabaseClient } from '@supabase/supabase-js';

/** Hours without a real tweet before the dead-man's switch pages. Default 3. */
export function twitterIngestStaleHours(
  envValue: string | undefined = process.env.TWITTER_INGEST_STALE_HOURS,
): number {
  const n = Number(envValue);
  if (Number.isFinite(n) && n > 0) return n;
  return 3;
}

/**
 * How many non-YouTube content_twitter rows were posted in the window.
 * YouTube insights are stored in the same table with twitter_id `yt-…` and
 * must not mask a dead Twitter scraper. Uses the posted_at index (head count).
 * fetched_at has no index; a migration to add one is out of scope.
 *
 * A quiet stretch where followed accounts simply did not post also returns 0.
 * Raise TWITTER_INGEST_STALE_HOURS if that false-alarms.
 */
export async function countRecentTwitterIngests(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('content_twitter')
    .select('id', { count: 'exact', head: true })
    .gte('posted_at', sinceIso)
    .not('twitter_id', 'like', 'yt-%');

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}
