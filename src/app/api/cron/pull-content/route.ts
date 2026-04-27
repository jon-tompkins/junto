import { NextRequest, NextResponse } from 'next/server';
import { getSourcesWithActiveNewsletters } from '@/lib/db/sources';
import { storeNewsletterContent } from '@/lib/db/content-newsletter';
import { startBatchRun } from '@/lib/twitter/apify-client';
import { createPendingRun } from '@/lib/db/apify-runs';
import { fetchChannelInsights } from '@/lib/youtube/client';
import { storeTwitterContent } from '@/lib/db/content-twitter';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes

// Skip sources pulled within this window (prevents redundant Apify calls)
const FRESHNESS_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
// If any source was updated in the last OVERLAP_WINDOW, assume a prior cron is
// running or just finished — bail to prevent duplicate runs.
const OVERLAP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
// How far back to look on each pull — covers the full freshness window plus a
// safety buffer so tweets posted right at the edge of the last window aren't
// missed. Duplicates are safe: storeTwitterContent deduplicates by twitter_id.
const PULL_LOOKBACK_MS = FRESHNESS_WINDOW_MS + 10 * 60 * 1000; // 40 minutes
// First-time pull lookback when a source has never been fetched.
const FIRST_PULL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

    // ─── Twitter Sources (per-handle) ───────────────
    const twitterSources = await getSourcesWithActiveNewsletters('twitter');
    const now = Date.now();
    // Shared since_time for all sources in this run — covers the full freshness
    // window plus a buffer. First-ever pulls use FIRST_PULL_LOOKBACK_MS instead.
    const defaultSinceDate = new Date(now - PULL_LOOKBACK_MS).toISOString();

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

      // Single Apify run for all stale handles — pay-per-result, same cost.
      // Fire-and-forget: store the run_id and let /api/cron/collect-twitter
      // ingest results once Apify finishes. This keeps us under Vercel's
      // function timeout when Apify needs > 1-2 minutes for the batch.
      const staleHandles = stale.map((s) => s.handle_or_url);
      // First-time sources need a longer lookback; use the oldest applicable window
      const hasFirstTimeSources = stale.some((s) => !s.updated_at);
      const batchSinceDate = hasFirstTimeSources
        ? new Date(now - FIRST_PULL_LOOKBACK_MS).toISOString()
        : defaultSinceDate;

      if (stale.length > 0) {
        try {
          const { runId } = await startBatchRun(staleHandles, 30, batchSinceDate);

          // Map clean handle → source_id so the collector can write tweets back
          // to the right source even if `sources` rows change between now and
          // the next collect tick.
          const handleSourceMap: Record<string, string> = {};
          for (const source of stale) {
            const clean = source.handle_or_url.replace('@', '').toLowerCase();
            handleSourceMap[clean] = source.id;
          }

          await createPendingRun({
            runId,
            handleSourceMap,
            sinceDate: batchSinceDate,
          });

          for (const source of stale) {
            results[source.handle_or_url] = {
              fetched: 0,
              stored: 0,
              error: `pending (apify run ${runId})`,
            };
          }
          console.log(
            `[pull-content] Twitter batch dispatched (${stale.length} handles, run ${runId}) — collect-twitter cron will ingest results.`,
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[pull-content] Apify start error:`, errMsg);
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

    // ─── Newsletter Sources ─────────────────────────
    const newsletterSources = await getSourcesWithActiveNewsletters('newsletter');

    if (newsletterSources.length > 0) {
      console.log(`[pull-content] Pulling ${newsletterSources.length} Newsletter sources...`);

      for (const source of newsletterSources) {
        const slug = source.handle_or_url;
        try {
          // Look up the matching available_newsletter row by slug
          const { data: availableNewsletter, error: anError } = await supabase
            .from('available_newsletters')
            .select('id, name')
            .eq('slug', slug)
            .single();

          if (anError || !availableNewsletter) {
            console.warn(`[pull-content] Newsletter slug not found in available_newsletters: ${slug}`);
            results[slug] = { fetched: 0, stored: 0, error: 'slug not found in available_newsletters' };
            continue;
          }

          const since = source.updated_at
            ? defaultSinceDate
            : new Date(now - FIRST_PULL_LOOKBACK_MS).toISOString();

          const { data: issues, error: issuesError } = await supabase
            .from('newsletter_content')
            .select('id, subject, content, received_at, message_id')
            .eq('newsletter_id', availableNewsletter.id)
            .gte('received_at', since)
            .order('received_at', { ascending: false });

          if (issuesError) throw issuesError;

          const fetched = issues?.length ?? 0;
          let stored = 0;

          if (fetched > 0) {
            stored = await storeNewsletterContent(
              source.id,
              (issues || []).map((issue) => ({
                newsletter_content_id: issue.id,
                subject: issue.subject ?? null,
                content: issue.content,
                received_at: issue.received_at,
              }))
            );
          }

          await supabase
            .from('sources')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', source.id);

          results[slug] = { fetched, stored };
          totalFetched += fetched;
          totalStored += stored;
          console.log(`[pull-content] Newsletter ${slug}: ${fetched} fetched, ${stored} stored`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[pull-content] Newsletter error ${slug}:`, errMsg);
          results[slug] = { fetched: 0, stored: 0, error: errMsg };
        }
      }
    }

    const totalSources = twitterSources.length + youtubeSources.length + newsletterSources.length;
    console.log(`[pull-content] Done. ${totalFetched} fetched, ${totalStored} stored from ${totalSources} sources.`);

    return NextResponse.json({
      success: true,
      sources: totalSources,
      twitter_sources: twitterSources.length,
      youtube_sources: youtubeSources.length,
      newsletter_sources: newsletterSources.length,
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
