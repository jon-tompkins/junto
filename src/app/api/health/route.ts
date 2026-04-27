import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import dayjs from 'dayjs';

export async function GET() {
  const timestamp = new Date().toISOString();
  const checks: any = {};
  let overallStatus = 'ok';

  try {
    const supabase = getSupabase();

    // Check 1: Tweets pulled in last 24 hours (V2 content_twitter)
    try {
      const since24h = dayjs().subtract(24, 'hour').toISOString();

      const { data: recentTweets, error: tweetsError } = await supabase
        .from('content_twitter')
        .select(`
          posted_at,
          sources!inner(handle_or_url)
        `)
        .gte('posted_at', since24h)
        .order('posted_at', { ascending: false });

      if (tweetsError) {
        checks.tweets_last_24h = {
          count: 0,
          by_source: {},
          status: 'fail',
          error: tweetsError.message
        };
        overallStatus = 'failing';
      } else {
        const bySource: Record<string, number> = {};
        for (const tweet of recentTweets || []) {
          const sources = tweet.sources as any;
          const handle = Array.isArray(sources)
            ? sources[0]?.handle_or_url
            : sources?.handle_or_url;
          if (handle) {
            bySource[handle] = (bySource[handle] || 0) + 1;
          }
        }

        const totalCount = recentTweets?.length || 0;
        const sourceCount = Object.keys(bySource).length;

        let status = 'ok';
        if (totalCount === 0) {
          status = 'fail';
          overallStatus = 'failing';
        }

        checks.tweets_last_24h = {
          count: totalCount,
          source_count: sourceCount,
          by_source: bySource,
          status
        };
      }
    } catch (error) {
      checks.tweets_last_24h = {
        count: 0,
        by_source: {},
        status: 'fail',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      overallStatus = 'failing';
    }

    // Check 2: Newsletter runs in last 24 hours (V2 newsletter_runs)
    try {
      const since24h = dayjs().subtract(24, 'hour').toISOString();

      const { data: recentRuns, error: runsError } = await supabase
        .from('newsletter_runs')
        .select('id, generated_at, status, newsletter_id')
        .gte('generated_at', since24h)
        .order('generated_at', { ascending: false });

      if (runsError) {
        checks.newsletter_runs_last_24h = {
          count: 0,
          status: 'fail',
          error: runsError.message
        };
        overallStatus = 'failing';
      } else {
        const total = recentRuns?.length || 0;
        const delivered = (recentRuns || []).filter((r: any) => r.status === 'delivered').length;
        const errored = (recentRuns || []).filter((r: any) => r.status === 'error').length;
        const latest = recentRuns?.[0];

        let status = 'ok';
        if (total === 0) {
          status = 'fail';
          overallStatus = 'failing';
        } else if (errored > 0 && overallStatus === 'ok') {
          status = 'warn';
          overallStatus = 'degraded';
        }

        checks.newsletter_runs_last_24h = {
          total,
          delivered,
          errored,
          latest_at: latest?.generated_at ?? null,
          status
        };
      }
    } catch (error) {
      checks.newsletter_runs_last_24h = {
        count: 0,
        status: 'fail',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      overallStatus = 'failing';
    }

    // Check 3: Most recent tweet — flags stalled pull/collect pipeline
    try {
      const { data: latestTweet, error: fetchError } = await supabase
        .from('content_twitter')
        .select('posted_at, fetched_at')
        .order('posted_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) {
        checks.last_fetch = {
          posted_at: null,
          fetched_at: null,
          status: 'fail',
          error: fetchError.message
        };
        overallStatus = 'failing';
      } else {
        const latestPosted = latestTweet?.posted_at;
        const latestFetched = latestTweet?.fetched_at;
        const hoursSincePosted = latestPosted ? dayjs().diff(dayjs(latestPosted), 'hour') : null;
        const hoursSinceFetched = latestFetched ? dayjs().diff(dayjs(latestFetched), 'hour') : null;

        let status = 'ok';
        if (!latestPosted) {
          status = 'fail';
          overallStatus = 'failing';
        } else if (hoursSinceFetched != null && hoursSinceFetched > 12) {
          // pull-content + collect-twitter run every 6h; >12h since last fetch = stalled
          status = 'fail';
          overallStatus = 'failing';
        }

        checks.last_fetch = {
          posted_at: latestPosted,
          fetched_at: latestFetched,
          hours_since_posted: hoursSincePosted,
          hours_since_fetched: hoursSinceFetched,
          status
        };
      }
    } catch (error) {
      checks.last_fetch = {
        posted_at: null,
        fetched_at: null,
        status: 'fail',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      overallStatus = 'failing';
    }

  } catch (error) {
    return NextResponse.json({
      status: 'failing',
      checks: {
        database_connection: {
          status: 'fail',
          error: error instanceof Error ? error.message : 'Database connection failed'
        }
      },
      timestamp
    }, { status: 503 });
  }

  const httpStatus = overallStatus === 'failing' ? 503 : 200;

  return NextResponse.json({
    status: overallStatus,
    checks,
    timestamp
  }, { status: httpStatus });
}

export async function POST() {
  return GET();
}
