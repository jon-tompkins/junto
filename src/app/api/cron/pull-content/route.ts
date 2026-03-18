import { NextRequest, NextResponse } from 'next/server';
import { getAllActiveSources } from '@/lib/db/sources';
import { storeTwitterContent } from '@/lib/db/content-twitter';
import { fetchTweetsForProfile } from '@/lib/twitter/client';

export const maxDuration = 300; // 5 minutes

// GET /api/cron/pull-content — pull fresh content from all active sources
// Triggered by Vercel cron every 2 hours
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret in production
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sources = await getAllActiveSources('twitter');

    if (sources.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active sources to pull from',
        sources: 0,
      });
    }

    console.log(`[pull-content] Pulling content from ${sources.length} active Twitter sources...`);

    const results: Record<string, { fetched: number; stored: number; error?: string }> = {};
    let totalFetched = 0;
    let totalStored = 0;

    for (const source of sources) {
      try {
        console.log(`[pull-content] Fetching @${source.handle_or_url}...`);

        const tweets = await fetchTweetsForProfile(source.handle_or_url, 30);

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

        results[source.handle_or_url] = { fetched: tweets.length, stored };
        totalFetched += tweets.length;
        totalStored += stored;

        console.log(`[pull-content] @${source.handle_or_url}: fetched ${tweets.length}, stored ${stored}`);
      } catch (error) {
        console.error(`[pull-content] Error fetching @${source.handle_or_url}:`, error);
        results[source.handle_or_url] = {
          fetched: 0,
          stored: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
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
