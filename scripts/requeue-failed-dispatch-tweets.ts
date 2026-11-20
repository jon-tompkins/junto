/**
 * One-off: re-queue dispatch crossposts that failed X's 280-character check.
 *
 * postTweet used to append " 🤖" and then throw `Tweet text must be 1–280 chars`.
 * Those failures were written to pending_dispatch_tweets.error_message and left
 * for a human. This script truncates tweet_text onto the shared weighted budget
 * and sets status back to `pending` so someone can approve them again.
 *
 * It does NOT post to X, does NOT call the X API, and does NOT touch posted or
 * rejected rows. Rows that failed for any other reason are left alone.
 *
 *   npx tsx scripts/requeue-failed-dispatch-tweets.ts            # dry run
 *   npx tsx scripts/requeue-failed-dispatch-tweets.ts --apply    # write
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or JUNTO_SUPABASE_URL +
 * JUNTO_SUPABASE_SERVICE_KEY, from the environment or .env.local.
 */
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isTweetLengthError, truncateTweetDraft } from '../src/lib/x/text';

loadEnv({ path: '.env.local' });

const PAGE = 500;

interface FailedRow {
  id: number;
  status: string;
  tweet_text: string;
  error_message: string | null;
}

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.JUNTO_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JUNTO_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or the JUNTO_ equivalents) are required');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function loadFailed(supabase: SupabaseClient): Promise<FailedRow[]> {
  const rows: FailedRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('pending_dispatch_tweets')
      .select('id, status, tweet_text, error_message')
      .in('status', ['pending', 'approved'])
      .not('error_message', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as FailedRow[];
    for (const row of page) {
      if ((row.status === 'pending' || row.status === 'approved') && isTweetLengthError(row.error_message)) {
        rows.push(row);
      }
    }
    if (page.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = client();
  const rows = await loadFailed(supabase);
  console.log(`${apply ? 'Applying' : 'Dry run'}: ${rows.length} length-failed dispatch tweet(s). Nothing will be posted.`);

  let updated = 0;
  for (const row of rows) {
    let tweetText: string;
    try {
      tweetText = truncateTweetDraft(row.tweet_text);
    } catch (err) {
      console.warn(`skip #${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const changed = tweetText !== row.tweet_text;
    console.log(
      `${apply ? 'update' : 'would update'} #${row.id} ${row.status} ${row.tweet_text.length} -> ${tweetText.length}${changed ? '' : ' (text unchanged, re-queued)'}`,
    );
    if (!apply) continue;
    const { error } = await supabase
      .from('pending_dispatch_tweets')
      .update({
        tweet_text: tweetText,
        status: 'pending',
        error_message: null,
        reviewed_at: null,
      })
      .eq('id', row.id)
      .neq('status', 'posted');
    if (error) throw error;
    updated += 1;
  }

  console.log(apply ? `Re-queued ${updated} row(s) as pending.` : 'Dry run only. Re-run with --apply to write.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
