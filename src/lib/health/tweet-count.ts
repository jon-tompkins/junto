import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Exact count of content_twitter rows posted since `sinceIso`.
 * Uses PostgREST head/count so the number is not capped at the 1,000-row
 * default that a normal select() hits. The posted_at index makes this a
 * range count, not a row download.
 */
export async function countTweetsPostedSince(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('content_twitter')
    .select('id', { count: 'exact', head: true })
    .gte('posted_at', sinceIso);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}
