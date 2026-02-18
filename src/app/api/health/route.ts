import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import dayjs from 'dayjs';

export async function GET() {
  const timestamp = new Date().toISOString();
  const checks: any = {};
  let overallStatus = 'ok';

  try {
    const supabase = getSupabase();
    
    // Check 1: Tweets in last 24 hours
    try {
      const since24h = dayjs().subtract(24, 'hour').toISOString();
      
      const { data: recentTweets, error: tweetsError } = await supabase
        .from('tweets')
        .select(`
          twitter_handle,
          posted_at,
          profiles!inner(twitter_handle)
        `)
        .gte('posted_at', since24h)
        .order('posted_at', { ascending: false });

      if (tweetsError) {
        checks.tweets_last_24h = {
          count: 0,
          by_profile: {},
          status: 'fail',
          error: tweetsError.message
        };
        overallStatus = 'failing';
      } else {
        // Group tweets by profile handle
        const byProfile: Record<string, number> = {};
        for (const tweet of recentTweets || []) {
          const handle = tweet.profiles?.twitter_handle || tweet.twitter_handle;
          if (handle) {
            byProfile[handle] = (byProfile[handle] || 0) + 1;
          }
        }

        const totalCount = recentTweets?.length || 0;
        const profileCount = Object.keys(byProfile).length;
        const profilesWithZeroTweets = Object.entries(byProfile).filter(([_, count]) => count === 0).length;
        
        let status = 'ok';
        if (totalCount === 0) {
          status = 'fail';
          overallStatus = 'failing';
        } else if (profilesWithZeroTweets > 0) {
          status = 'warn';
          if (overallStatus === 'ok') overallStatus = 'degraded';
        }

        checks.tweets_last_24h = {
          count: totalCount,
          by_profile: byProfile,
          status
        };
      }
    } catch (error) {
      checks.tweets_last_24h = {
        count: 0,
        by_profile: {},
        status: 'fail',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      overallStatus = 'failing';
    }

    // Check 2: Newsletter sent today
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const expectedSendTime = '07:00'; // 7am local time expected
      const currentHour = dayjs().hour();
      
      const { data: todayNewsletters, error: newsletterError } = await supabase
        .from('newsletters')
        .select('*')
        .gte('sent_at', today + 'T00:00:00Z')
        .lt('sent_at', today + 'T23:59:59Z')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1);

      if (newsletterError) {
        checks.newsletter_today = {
          sent: false,
          status: 'fail',
          error: newsletterError.message
        };
        overallStatus = 'failing';
      } else {
        const latestNewsletter = todayNewsletters?.[0];
        const wasExpected = currentHour >= 7; // After 7am, we expect a newsletter

        if (latestNewsletter) {
          checks.newsletter_today = {
            sent: true,
            sent_at: latestNewsletter.sent_at,
            recipient: latestNewsletter.sent_to?.[0] || 'unknown',
            status: 'ok'
          };
        } else if (wasExpected) {
          checks.newsletter_today = {
            sent: false,
            status: 'fail',
            message: `No newsletter sent today (expected by ${expectedSendTime})`
          };
          overallStatus = 'failing';
        } else {
          checks.newsletter_today = {
            sent: false,
            status: 'ok',
            message: 'Newsletter not yet due (before 7am)'
          };
        }
      }
    } catch (error) {
      checks.newsletter_today = {
        sent: false,
        status: 'fail',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      overallStatus = 'failing';
    }

    // Check 3: Last fetch activity
    try {
      // Get most recent tweet across all profiles to check if fetching is working
      const { data: latestTweet, error: fetchError } = await supabase
        .from('tweets')
        .select(`
          posted_at,
          profiles!inner(twitter_handle)
        `)
        .order('posted_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) {
        checks.last_fetch = {
          timestamp: null,
          profiles_fetched: 0,
          status: 'fail',
          error: fetchError.message
        };
        overallStatus = 'failing';
      } else {
        // Check how recent the latest tweet is
        const latestTimestamp = latestTweet?.posted_at;
        const hoursAgo = latestTimestamp ? dayjs().diff(dayjs(latestTimestamp), 'hour') : null;
        
        // Get count of unique profiles that have tweets
        const { data: profilesWithTweets } = await supabase
          .from('tweets')
          .select('profile_id', { count: 'exact' })
          .not('profile_id', 'is', null);

        const uniqueProfiles = new Set(profilesWithTweets?.map((t: any) => t.profile_id) || []).size;
        
        let status = 'ok';
        if (!latestTimestamp) {
          status = 'fail';
          overallStatus = 'failing';
        } else if (hoursAgo && hoursAgo > 6) {
          // If latest tweet is more than 6 hours old, something might be wrong
          status = 'fail';
          overallStatus = 'failing';
        }

        checks.last_fetch = {
          timestamp: latestTimestamp,
          profiles_fetched: uniqueProfiles,
          hours_since_latest: hoursAgo,
          status
        };
      }
    } catch (error) {
      checks.last_fetch = {
        timestamp: null,
        profiles_fetched: 0,
        status: 'fail',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      overallStatus = 'failing';
    }

  } catch (error) {
    // Supabase connection failed
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

// Support POST for testing
export async function POST() {
  return GET();
}