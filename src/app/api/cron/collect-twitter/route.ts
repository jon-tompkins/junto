import { NextRequest, NextResponse } from 'next/server';
import { collectBatchResults } from '@/lib/twitter/apify-client';
import {
  listPendingRuns,
  markRunCompleted,
  markRunFailed,
} from '@/lib/db/apify-runs';
import { storeTwitterContent, getRecentContentForSources, selectProfileSynthesisTweets } from '@/lib/db/content-twitter';
import { updateSourceProfile } from '@/lib/synthesis/profile-updater';
import { getSourcesMissingOrStaleProfiles, getSourceProfile } from '@/lib/db/source-analyst-profiles';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes

// Re-synthesize a source's analyst profile (Haiku) at most once per day. Pulls
// now run every ~30 min, but profile inference is decoupled from pull cadence —
// analyst stances don't move minute-to-minute, so daily keeps cost flat.
const PROFILE_RESYNTH_MS = 24 * 60 * 60 * 1000; // 24 hours

// GET /api/cron/collect-twitter — poll Apify for pending batch runs and ingest
// any that have finished. Pairs with /api/cron/pull-content which only kicks
// off the Apify run; this endpoint does the storage half asynchronously so we
// don't blow Vercel's function-timeout budget on long Apify scrapes.
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[collect-twitter] CRON_SECRET is not set — refusing to run');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const pending = await listPendingRuns();

    console.log(`[collect-twitter] Checking ${pending.length} pending Apify run(s)...`);

    const summary: Array<{
      run_id: string;
      status: string;
      tweets?: number;
      stored?: number;
      handles?: number;
      error?: string;
    }> = [];

    let totalStored = 0;
    let totalFetched = 0;
    let processedCount = 0;

    // Collect profile update tasks so we can await them all before responding.
    // Fire-and-forget was getting killed by Vercel before Haiku could finish.
    const profileTasks: Array<{ sourceId: string; handle: string; tweets: any[] }> = [];

    for (const run of pending) {
      const handles = Object.keys(run.handle_source_map);
      try {
        const result = await collectBatchResults(run.run_id, handles);

        if (result.status === 'pending') {
          summary.push({ run_id: run.run_id, status: 'pending', handles: handles.length });
          continue;
        }

        if (result.status === 'failed') {
          await markRunFailed(run.id, result.reason);
          console.error(`[collect-twitter] Run ${run.run_id} failed: ${result.reason}`);
          summary.push({
            run_id: run.run_id,
            status: 'failed',
            handles: handles.length,
            error: result.reason,
          });
          processedCount += 1;
          continue;
        }

        // SUCCEEDED — ingest per-source
        let runStored = 0;
        for (const handle of handles) {
          const sourceId = run.handle_source_map[handle];
          if (!sourceId) continue;
          const tweets = result.tweetsByHandle[handle] || [];

          try {
            const stored = await storeTwitterContent(
              sourceId,
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

            // Backfill avatar_url and display_name from tweet author data
            const firstTweetWithAuthor = tweets.find((t) => (t.raw_data as any)?.author?.profilePicture);
            const authorData = firstTweetWithAuthor ? (firstTweetWithAuthor.raw_data as any).author : null;
            const profileUpdate: Record<string, string> = { updated_at: new Date().toISOString() };
            if (authorData?.profilePicture) profileUpdate.avatar_url = authorData.profilePicture;
            if (authorData?.name) profileUpdate.display_name = authorData.name;

            await supabase
              .from('sources')
              .update(profileUpdate)
              .eq('id', sourceId);

            runStored += stored;
            console.log(`[collect-twitter] @${handle}: ${tweets.length} fetched, ${stored} stored`);

            if (stored > 0) {
              profileTasks.push({ sourceId, handle, tweets });
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[collect-twitter] Store error @${handle}:`, errMsg);
          }
        }

        await markRunCompleted(run.id);
        totalStored += runStored;
        totalFetched += result.tweetCount;
        processedCount += 1;
        summary.push({
          run_id: run.run_id,
          status: 'completed',
          tweets: result.tweetCount,
          stored: runStored,
          handles: handles.length,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[collect-twitter] Error for run ${run.run_id}:`, errMsg);
        summary.push({
          run_id: run.run_id,
          status: 'error',
          handles: handles.length,
          error: errMsg,
        });
      }
    }

    // Await all profile updates from this cycle's new tweets — but only re-synth
    // a source whose profile is older than PROFILE_RESYNTH_MS, so frequent pulls
    // don't trigger Haiku on every ingest. New tweets are already stored; the
    // profile just catches up once a day.
    for (const { sourceId, handle } of profileTasks) {
      try {
        const existing = await getSourceProfile(sourceId);
        if (
          existing &&
          Date.now() - new Date(existing.last_updated).getTime() < PROFILE_RESYNTH_MS
        ) {
          continue;
        }
        // Re-synth over the FULL window since the last profile update (recency-first),
        // not just this 10-min cycle's newly-stored tweets. Profiles re-synth ~once/day,
        // so mentions that landed in the day's other (throttled) cycles would otherwise
        // never be seen and last_mentioned would read stale despite active tweeting.
        const windowHours = existing
          ? Math.min(
              336,
              Math.max(48, Math.ceil((Date.now() - new Date(existing.last_updated).getTime()) / 3_600_000) + 6)
            )
          : 336;
        const windowRows = await getRecentContentForSources([sourceId], windowHours);
        const tweets = selectProfileSynthesisTweets(windowRows);
        if (tweets.length === 0) continue;
        await updateSourceProfile(sourceId, handle, tweets);
      } catch (err) {
        console.warn(
          `[collect-twitter] Profile update failed for @${handle}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Sweep for sources with no profile or a stale one (>48h), capped at 3 per cycle
    try {
      const missing = await getSourcesMissingOrStaleProfiles();
      const toSeed = missing.slice(0, 3);
      for (const src of toSeed) {
        const recent = await getRecentContentForSources([src.id], 336);
        const tweets = selectProfileSynthesisTweets(recent);
        if (tweets.length > 0) {
          console.log(`[collect-twitter] Seeding missing profile for @${src.handle_or_url} from ${tweets.length} stored tweets`);
          await updateSourceProfile(src.id, src.handle_or_url, tweets);
        }
      }
    } catch (err) {
      console.warn('[collect-twitter] Missing-profile sweep error:', err instanceof Error ? err.message : err);
    }

    console.log(
      `[collect-twitter] Done. Processed ${processedCount}/${pending.length} runs. ${totalFetched} tweets fetched, ${totalStored} stored.`,
    );

    return NextResponse.json({
      success: true,
      pending: pending.length,
      processed: processedCount,
      total_fetched: totalFetched,
      total_stored: totalStored,
      runs: summary,
    });
  } catch (error) {
    console.error('[collect-twitter] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
