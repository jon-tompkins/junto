import { getSupabase } from '@/lib/db/client';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myjunto.xyz';
const MAX_TWEET_LEN = 270;

/**
 * Extract a short summary from newsletter markdown/HTML content.
 * Strips markdown and returns up to ~120 chars from the first non-empty paragraph.
 */
function extractSummary(content: string | null): string {
  if (!content) return '';
  const plain = content
    .replace(/^#{1,6}\s+.+$/gm, '')   // strip headings
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
    .replace(/\n{2,}/g, '\n')
    .trim();
  const firstPara = plain.split('\n').find((l) => l.trim().length > 20) ?? '';
  return firstPara.length > 120 ? firstPara.slice(0, 117) + '…' : firstPara;
}

/**
 * Compose a tweet for a newsletter run.
 * Format: "<summary> $TKR1 $TKR2 <permalink>"
 * Never exceeds MAX_TWEET_LEN characters.
 */
function composeTweet(
  summary: string,
  tickers: string[],
  permalink: string,
): string {
  const cashtags = tickers.slice(0, 3).map((t) => `$${t}`).join(' ');
  const suffix = `${cashtags ? ' ' + cashtags : ''} ${permalink}`.trimEnd();
  const budget = MAX_TWEET_LEN - suffix.length - 1;
  const lead = summary.length > budget ? summary.slice(0, budget - 1) + '…' : summary;
  return `${lead}${suffix}`;
}

interface QueuedRun {
  id: string;
  newsletter_id: string;
  content: string | null;
  subject: string | null;
  tickers: string[];
  generated_at: string;
}

/**
 * Find newly-delivered PUBLIC newsletter_runs that don't yet have a
 * pending_dispatch_tweets row, compose a tweet for each, and insert them
 * into the review queue. Returns the count of tweets queued.
 */
export async function queueDispatchTweets(lookbackHours = 25): Promise<number> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  // Fetch delivered runs from PUBLIC newsletters in the lookback window.
  const { data: runs, error: runErr } = await supabase
    .from('newsletter_runs')
    .select('id, newsletter_id, content, subject, tickers, generated_at, newsletters_v2!inner(is_public)')
    .eq('status', 'delivered')
    .eq('newsletters_v2.is_public', true)
    .gte('generated_at', since)
    .order('generated_at', { ascending: false });

  if (runErr) throw runErr;
  if (!runs || runs.length === 0) return 0;

  // Find which run IDs already have a pending_dispatch_tweets row.
  const runIds = runs.map((r: any) => r.id);
  const { data: existing } = await supabase
    .from('pending_dispatch_tweets')
    .select('newsletter_run_id')
    .in('newsletter_run_id', runIds);
  const seen = new Set((existing ?? []).map((r: any) => r.newsletter_run_id));

  const fresh: QueuedRun[] = (runs as any[])
    .filter((r) => !seen.has(r.id))
    .map((r) => ({
      id: r.id,
      newsletter_id: r.newsletter_id,
      content: r.content,
      subject: r.subject,
      tickers: (r.tickers as string[] | null) ?? [],
      generated_at: r.generated_at,
    }));

  if (fresh.length === 0) return 0;

  const rows = fresh.map((run) => {
    const summary = extractSummary(run.content) || run.subject || 'New dispatch';
    const permalink = `${APP_BASE_URL}/newsletter/${run.newsletter_id}/${run.id}`;
    const tweet_text = composeTweet(summary, run.tickers, permalink);
    return {
      newsletter_run_id: run.id,
      newsletter_id: run.newsletter_id,
      tweet_text,
      tickers: run.tickers,
      permalink,
      status: 'pending',
    };
  });

  const { error: insertErr } = await supabase
    .from('pending_dispatch_tweets')
    .insert(rows);

  if (insertErr) throw insertErr;
  return rows.length;
}
