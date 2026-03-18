import { getSupabase } from './client';
import type { ContentTwitter, GroupedTweets } from '@/types';

const supabase = () => getSupabase();

export async function storeTwitterContent(
  sourceId: string,
  tweets: {
    twitter_id: string;
    content: string;
    posted_at: string;
    likes?: number;
    retweets?: number;
    replies?: number;
    is_retweet?: boolean;
    is_reply?: boolean;
    thread_id?: string;
    raw_data?: Record<string, unknown>;
  }[]
): Promise<number> {
  if (tweets.length === 0) return 0;

  const rows = tweets.map((t) => ({
    source_id: sourceId,
    twitter_id: t.twitter_id,
    content: t.content,
    posted_at: t.posted_at,
    likes: t.likes ?? 0,
    retweets: t.retweets ?? 0,
    replies: t.replies ?? 0,
    is_retweet: t.is_retweet ?? false,
    is_reply: t.is_reply ?? false,
    thread_id: t.thread_id ?? null,
    raw_data: t.raw_data ?? {},
    fetched_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase()
    .from('content_twitter')
    .upsert(rows, { onConflict: 'twitter_id' })
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

export async function getRecentContentForSources(
  sourceIds: string[],
  hoursBack: number = 48
): Promise<ContentTwitter[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase()
    .from('content_twitter')
    .select('*')
    .in('source_id', sourceIds)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getContextContentForSources(
  sourceIds: string[],
  daysBack: number = 180,
  excludeRecentHours: number = 48
): Promise<ContentTwitter[]> {
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const recentCutoff = new Date(Date.now() - excludeRecentHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase()
    .from('content_twitter')
    .select('*')
    .in('source_id', sourceIds)
    .gte('posted_at', sinceDate)
    .lt('posted_at', recentCutoff)
    .order('likes', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
}

/**
 * Group content by source handle for the synthesis pipeline.
 * Requires a sourceMap of { source_id: handle } to group by.
 */
export function groupContentByHandle(
  content: ContentTwitter[],
  sourceMap: Record<string, string>
): GroupedTweets {
  const grouped: GroupedTweets = {};

  for (const item of content) {
    const handle = sourceMap[item.source_id];
    if (!handle) continue;

    if (!grouped[handle]) grouped[handle] = [];
    grouped[handle].push({
      twitter_id: item.twitter_id,
      content: item.content,
      likes: item.likes,
      retweets: item.retweets,
      posted_at: item.posted_at,
      thread_id: item.thread_id ?? undefined,
    });
  }

  return grouped;
}

export async function getContentCountForSource(sourceId: string, hoursBack: number = 48): Promise<number> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase()
    .from('content_twitter')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)
    .gte('posted_at', since);

  if (error) throw error;
  return count ?? 0;
}

export async function cleanupOldContent(daysToKeep: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase()
    .from('content_twitter')
    .delete()
    .lt('posted_at', cutoff)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}
