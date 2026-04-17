import { NextRequest, NextResponse } from 'next/server';
import { getSourcesWithActiveNewsletters } from '@/lib/db/sources';
import { storeTwitterContent } from '@/lib/db/content-twitter';
import { fetchTweetsForMultipleProfiles } from '@/lib/twitter/client';
import { fetchChannelInsights } from '@/lib/youtube/client';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes

// Skip sources pulled within this window (prevents redundant Apify calls)
const FRESHNESS_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
// If any source was updated in the last OVERLAP_WINDOW, assume a prior cron is
// running or just finished — bail to prevent duplicate runs.
const OVERLAP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// GET /api/cron/pull-content — pull fresh content from all source types
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const results: Record<string, { fetched: number; stored: number; error?: string }> = {};
    let totalFetched = 0;
    let totalStored = 0;

    // ─── Twitter Sources (BATCHED) ──────────────────
    const twitterSources = await getSourcesWithActiveNewsletters('twitter');
    const now = Date.now();

    // Overlap guard: if any source was just updated (< 5 min ago), assume another
    // pull-content cron is mid-flight or just finished. Bail to avoid duplicates.
    const recentlyUpdated = twitterSources.some(
      (s) => s.updated_at && now - new Date(s.updated_at).getTime() < OVERLAP_WINDOW_MS,
    );
    if (recentlyUpdated) {
      console.log(`[pull-content] A source was updated within ${OVERLAP_WINDOW_MS / 1000}s — another run is active or just finished. Skipping Twitter pull.`);
    } else if (twitterSources.length > 0) {
      // Freshness filter: only pull sources last updated > 30 min ago (or never)
      const stale = twitterSources.filter(
        (s) => !s.updated_at || now - new Date(s.updated_at).getTime() >= FRESHNESS_WINDOW_MS,
      );
      const skipped = twitterSources.length - stale.length;

      console.log(
        `[pull-content] ${twitterSources.length} Twitter sources total, ${stale.length} stale (>30min), ${skipped} fresh (skipped).`,
      );

      if (stale.length > 0) {
        // Oldest `updated_at` across stale sources determines the `since` filter —
        // this ensures we don't miss tweets posted between pulls. Fall back to 48h ago.
        const oldestUpdate = stale.reduce<string | null>((min, s) => {
          if (!s.updated_at) return null; // never pulled — need broader range
          if (min === null) return min;
          return s.updated_at < min ? s.updated_at : min;
        }, new Date(now - 48 * 60 * 60 * 1000).toISOString());

        try {
          const handles = stale.map((s) => s.handle_or_url);
          const tweetsByHandle = await fetchTweetsForMultipleProfiles(
            handles,
            30,
            oldestUpdate || undefined,
          );

          // Store + update per source in parallel
          const storeResults = await Promise.allSettled(
            stale.map(async (source) => {
              const tweets = tweetsByHandle[source.handle_or_url] || [];
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
                })),
              );

              await supabase
                .from('sources')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', source.id);

              return { handle: source.handle_or_url, fetched: tweets.length, stored };
            }),
          );

          for (let i = 0; i < storeResults.length; i++) {
            const result = storeResults[i];
            const handle = stale[i].handle_or_url;

            if (result.status === 'fulfilled') {
              results[handle] = { fetched: result.value.fetched, stored: result.value.stored };
              totalFetched += result.value.fetched;
              totalStored += result.value.stored;
            } else {
              const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
              console.error(`[pull-content] Store error @${handle}:`, errMsg);
              results[handle] = { fetched: 0, stored: 0, error: errMsg };
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error('[pull-content] Batched Apify run failed:', errMsg);
          // Mark all attempted sources as errored so the response is informative
          for (const source of stale) {
            results[source.handle_or_url] = { fetched: 0, stored: 0, error: errMsg };
          }
        }
      }
    }

    // ─── YouTube Sources ────────────────────────────
    const youtubeSources = await getSourcesWithActiveNewsletters('youtube');

    if (youtubeSources.length > 0) {
      console.log(`[pull-content] Pulling ${youtubeSources.length} YouTube sources...`);

      // YouTube is more expensive (transcript + AI summary), process sequentially
      for (const source of youtubeSources) {
        try {
          const sinceDate = source.updated_at || undefined;
          const insights = await fetchChannelInsights(
            source.handle_or_url,
            3, // max 3 recent videos per pull
            sinceDate,
          );

          if (insights.length > 0) {
            // Store insights as synthetic tweets in content_twitter
            // This way the newsletter generator picks them up automatically
            const stored = await storeTwitterContent(
              source.id,
              insights.map((insight, idx) => ({
                twitter_id: `yt-${insight.videoId}-${idx}`, // Unique ID per insight
                content: insight.content,
                posted_at: insight.publishedAt,
                likes: 0,
                retweets: 0,
                replies: 0,
                is_retweet: false,
                is_reply: false,
                thread_id: insight.videoId, // Group insights by video
                raw_data: {
                  type: 'youtube_insight',
                  videoId: insight.videoId,
                  videoTitle: insight.videoTitle,
                  channelName: insight.channelName,
                  videoUrl: `https://www.youtube.com/watch?v=${insight.videoId}`,
                },
              }))
            );

            results[source.handle_or_url] = { fetched: insights.length, stored };
            totalFetched += insights.length;
            totalStored += stored;
            console.log(`[pull-content] YouTube ${source.handle_or_url}: ${insights.length} insights stored`);
          } else {
            results[source.handle_or_url] = { fetched: 0, stored: 0 };
            console.log(`[pull-content] YouTube ${source.handle_or_url}: no new videos`);
          }

          await supabase
            .from('sources')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', source.id);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[pull-content] YouTube error ${source.handle_or_url}:`, errMsg);
          results[source.handle_or_url] = { fetched: 0, stored: 0, error: errMsg };
        }
      }
    }

    const totalSources = twitterSources.length + youtubeSources.length;
    console.log(`[pull-content] Done. ${totalFetched} fetched, ${totalStored} stored from ${totalSources} sources.`);

    return NextResponse.json({
      success: true,
      sources: totalSources,
      twitter_sources: twitterSources.length,
      youtube_sources: youtubeSources.length,
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
