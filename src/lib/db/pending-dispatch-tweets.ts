import { getSupabase } from './client';

const supabase = () => getSupabase();

export type PendingDispatchTweetStatus = 'pending' | 'approved' | 'rejected' | 'posted';

interface PendingDispatchTweetRow {
  id: number;
  newsletter_run_id: string;
  newsletter_id: string;
  tweet_text: string;
  tickers: string[];
  permalink: string;
  status: PendingDispatchTweetStatus;
  created_at: string;
  reviewed_at: string | null;
  posted_tweet_id: string | null;
  posted_tweet_url: string | null;
  error_message: string | null;
}

export interface PendingDispatchTweet extends PendingDispatchTweetRow {
  newsletter_name: string | null;
  run_subject: string | null;
  run_generated_at: string | null;
}

export async function listPendingDispatchTweets(limit = 100): Promise<PendingDispatchTweet[]> {
  const { data, error } = await supabase()
    .from('pending_dispatch_tweets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = (data ?? []) as PendingDispatchTweetRow[];
  if (rows.length === 0) return [];

  const newsletterIds = Array.from(new Set(rows.map((row) => row.newsletter_id)));
  const runIds = Array.from(new Set(rows.map((row) => row.newsletter_run_id)));

  const [{ data: newsletters, error: newslettersError }, { data: runs, error: runsError }] = await Promise.all([
    supabase()
      .from('newsletters_v2')
      .select('id, name')
      .in('id', newsletterIds),
    supabase()
      .from('newsletter_runs')
      .select('id, subject, generated_at')
      .in('id', runIds),
  ]);

  if (newslettersError) throw newslettersError;
  if (runsError) throw runsError;

  const newsletterNameById = new Map(
    ((newsletters ?? []) as Array<{ id: string; name: string | null }>).map((newsletter) => [
      newsletter.id,
      newsletter.name ?? null,
    ]),
  );
  const runById = new Map(
    ((runs ?? []) as Array<{ id: string; subject: string | null; generated_at: string | null }>).map((run) => [
      run.id,
      run,
    ]),
  );

  return rows.map((row) => {
    const run = runById.get(row.newsletter_run_id);
    return {
      ...row,
      newsletter_name: newsletterNameById.get(row.newsletter_id) ?? null,
      run_subject: run?.subject ?? null,
      run_generated_at: run?.generated_at ?? null,
    };
  });
}

export async function getPendingDispatchTweet(id: number): Promise<PendingDispatchTweet | null> {
  const rows = await listPendingDispatchTweets(200);
  return rows.find((row) => row.id === id) ?? null;
}

export async function updatePendingDispatchTweet(
  id: number,
  updates: Partial<Pick<PendingDispatchTweetRow, 'tweet_text' | 'status' | 'error_message' | 'posted_tweet_id' | 'posted_tweet_url'>>,
): Promise<void> {
  const patch: Record<string, string | null> = {};

  if (typeof updates.tweet_text === 'string') patch.tweet_text = updates.tweet_text;
  if (typeof updates.status === 'string') patch.status = updates.status;
  if (updates.error_message !== undefined) patch.error_message = updates.error_message;
  if (updates.posted_tweet_id !== undefined) patch.posted_tweet_id = updates.posted_tweet_id;
  if (updates.posted_tweet_url !== undefined) patch.posted_tweet_url = updates.posted_tweet_url;
  if (updates.status !== undefined && updates.status !== 'pending') {
    patch.reviewed_at = new Date().toISOString();
  }
  if (updates.status === 'pending') {
    patch.reviewed_at = null;
  }

  const { error } = await supabase()
    .from('pending_dispatch_tweets')
    .update(patch)
    .eq('id', id);

  if (error) throw error;
}
