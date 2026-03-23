import { NextRequest, NextResponse } from 'next/server';
import { getSourcesWithActiveNewsletters } from '@/lib/db/sources';
import { storeTwitterContent } from '@/lib/db/content-twitter';
import { fetchTweetsForProfile } from '@/lib/twitter/client';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes

const CONCURRENCY = 5; // Process 5 sources at a time

// GET /api/cron/pull-content — pull fresh content from sources with active newsletters
// Triggered by Vercel cron every 2 hours
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret in production
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only pull sources that are attached to active newsletters
    const sources = await getSourcesWithActiveNewsletters('twitter');

    if (sources.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active sources with newsletters to pull from',
        sources: 0,
      });
    }

    console.log(`[pull-content] Pulling content from ${sources.length} sources with active newsletters (concurrency: ${CONCURRENCY})...`);

    const supabase = getSupabase();
    const results: Record<string, { fetched: number; stored: number; error?: string }> = {};
    let totalFetched = 0;
    let totalStored = 0;

    // Process in batches of CONCURRENCY
    for (let i = 0; i < sources.length; i += CONCURRENCY) {
      const batch = sources.slice(i, i + CONCURRENCY);
      console.log(`[pull-content] Batch ${Math.floor(i / CONCURRENCY) + 1}: ${batch.map(s => '@' + s.handle_or_url).join(', ')}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (source) => {
          // Use source.updated_at as the "last fetched" marker
          // Only fetch tweets since last pull to minimize API usage
          const sinceDate = source.updated_at || undefined;

          const tweets = await fetchTweetsForProfile(source.handle_or_url, 30, sinceDate);

          const stored = await storeTwitterContent(
            source.id,
            tweets.map((t) => ({
              twitter_id: t.twitter_id,
              content: t.content,
              posted_at: t.posted_at,
              likes: t.likes,
              retweets: t.retweets,
              replies: t.replies,
              is_retweet: t.is_retweet,
              is_reply: t.is_reply,
              thread_id: t.thread_id ?? undefined,
              raw_data: t.raw_data,
            }))
          );

          // Update source.updated_at to mark last successful fetch
          await supabase
            .from('sources')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', source.id);

          console.log(`[pull-content] @${source.handle_or_url}: fetched ${tweets.length} new, stored ${stored}`);
          return { handle: source.handle_or_url, fetched: tweets.length, stored };
        })
      );

      // Collect results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const handle = batch[j].handle_or_url;

        if (result.status === 'fulfilled') {
          results[handle] = { fetched: result.value.fetched, stored: result.value.stored };
          totalFetched += result.value.fetched;
          totalStored += result.value.stored;
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          console.error(`[pull-content] Error fetching @${handle}:`, errMsg);
          results[handle] = { fetched: 0, stored: 0, error: errMsg };
        }
      }
    }

    console.log(`[pull-content] Done. Total: ${totalFetched} fetched, ${totalStored} stored from ${sources.length} sources.`);

    return NextResponse.json({
      success: true,
      sources: sources.length,
      total_fetched: totalFetched,
      total_stored: totalStored,
      results,
    });
  } catch (error) {
    console.error('[pull-content] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
