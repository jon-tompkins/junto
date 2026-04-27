import { NextRequest, NextResponse } from 'next/server';
import { collectBatchResults } from '@/lib/twitter/apify-client';
import {
  listPendingRuns,
  markRunCompleted,
  markRunFailed,
} from '@/lib/db/apify-runs';
import { storeTwitterContent, getRecentContentForSources } from '@/lib/db/content-twitter';
import { updateSourceProfile } from '@/lib/synthesis/profile-updater';
import { getSourceProfile } from '@/lib/db/source-analyst-profiles';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes

// GET /api/cron/collect-twitter — poll Apify for pending batch runs and ingest
// any that have finished. Pairs with /api/cron/pull-content which only kicks
// off the Apify run; this endpoint does the storage half asynchronously so we
// don't blow Vercel's function-timeout budget on long Apify scrapes.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const pending = await listPendingRuns();

    if (pending.length === 0) {
      return NextResponse.json({ success: true, pending: 0, processed: 0 });
    }

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
          console.error(
            `[collect-twitter] Run ${run.run_id} failed: ${result.reason}`,
          );
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
          // collectBatchResults keys results by the handles we passed in; we
          // passed clean handles, so look those up directly.
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

            await supabase
              .from('sources')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', sourceId);

            runStored += stored;
            console.log(
              `[collect-twitter] @${handle}: ${tweets.length} fetched, ${stored} stored`,
            );

            if (stored > 0) {
              updateSourceProfile(sourceId, handle, tweets).catch((err) =>
                console.warn(
                  `[collect-twitter] Profile update failed for @${handle}:`,
                  err instanceof Error ? err.message : err,
                ),
              );
            } else {
              // No new tweets, but check if this source is missing a profile entirely.
              // If so, seed it from existing stored tweets.
              getSourceProfile(sourceId).then((profile) => {
                if (!profile) {
                  getRecentContentForSources([sourceId], 336).then((allRecent) => {
                    // Cap at 30 tweets sorted by engagement to keep Haiku prompt manageable
                    const recent = allRecent
                      .sort((a, b) => (b.likes + b.retweets * 2) - (a.likes + a.retweets * 2))
                      .slice(0, 30);
                    const seed = recent.map((r) => ({
                      twitter_id: r.twitter_id,
                      content: r.content,
                      posted_at: r.posted_at,
                      likes: r.likes ?? 0,
                      retweets: r.retweets ?? 0,
                      replies: r.replies ?? 0,
                      is_retweet: r.is_retweet ?? false,
                      is_reply: r.is_reply ?? false,
                      thread_id: r.thread_id ?? undefined,
                      raw_data: r.raw_data,
                    }));
                    if (seed.length > 0) {
                      console.log(`[collect-twitter] Seeding missing profile for @${handle} from ${seed.length} stored tweets`);
                      updateSourceProfile(sourceId, handle, seed).catch((err) =>
                        console.warn(
                          `[collect-twitter] Profile seed failed for @${handle}:`,
                          err instanceof Error ? err.message : err,
                        ),
                      );
                    }
                  }).catch(() => {});
                }
              }).catch(() => {});
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
