import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import dayjs from 'dayjs';

export async function GET() {
  try {
    const supabase = getSupabase();
    
    // Get Jon's user
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', 'jon.tomp@gmail.com')
      .single();
    
    // Get Jon's profiles
    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('profiles(id, twitter_handle)')
      .eq('user_id', user?.id);
    
    const profileHandles = userProfiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
    const profileIds = userProfiles?.map((p: any) => p.profiles?.id).filter(Boolean) || [];
    
    // Get recent tweets (last 48 hours) for Jon's profiles
    const since48h = dayjs().subtract(48, 'hour').toISOString();
    const since7d = dayjs().subtract(7, 'day').toISOString();
    
    const { data: recentTweets, error: recentError } = await supabase
      .from('tweets')
      .select('id, twitter_handle, posted_at, content, profile_id')
      .in('profile_id', profileIds)
      .gte('posted_at', since48h)
      .order('posted_at', { ascending: false })
      .limit(20);
    
    // Get any tweets from last 7 days for context
    const { data: weekTweets } = await supabase
      .from('tweets')
      .select('id, twitter_handle, posted_at, profile_id')
      .in('profile_id', profileIds)
      .gte('posted_at', since7d)
      .order('posted_at', { ascending: false })
      .limit(50);
    
    // Get total tweet count for Jon's profiles
    const { count } = await supabase
      .from('tweets')
      .select('*', { count: 'exact', head: true })
      .in('profile_id', profileIds);
    
    // Get most recent tweet regardless of time - for Jon's profiles
    const { data: latestTweetForJon, error: latestError } = await supabase
      .from('tweets')
      .select('twitter_handle, posted_at, content, profile_id')
      .in('profile_id', profileIds)
      .order('posted_at', { ascending: false })
      .limit(5);
    
    // Debug: get any tweet by one of Jon's profile IDs directly
    const { data: sampleTweet, error: sampleError } = await supabase
      .from('tweets')
      .select('*')
      .eq('profile_id', profileIds[0])
      .limit(3);
    
    // Get most recent tweet in entire DB
    const { data: latestTweetGlobal } = await supabase
      .from('tweets')
      .select('twitter_handle, posted_at, content, profile_id')
      .order('posted_at', { ascending: false })
      .limit(5);
    
    // Total tweets in DB
    const { count: totalGlobal } = await supabase
      .from('tweets')
      .select('*', { count: 'exact', head: true });
    
    return NextResponse.json({
      user: { id: user?.id, email: user?.email },
      profiles: profileHandles,
      profileIds,
      totalTweetsForUser: count,
      totalTweetsGlobal: totalGlobal,
      recentTweets48h: {
        count: recentTweets?.length || 0,
        tweets: recentTweets?.map(t => ({
          handle: t.twitter_handle,
          posted_at: t.posted_at,
          snippet: t.content?.slice(0, 80)
        }))
      },
      tweetsLast7d: weekTweets?.length || 0,
      latestTweetForJon: latestTweetForJon?.map(t => ({
        handle: t.twitter_handle,
        posted_at: t.posted_at,
        profile_id: t.profile_id,
        snippet: t.content?.slice(0, 100)
      })),
      latestError: latestError?.message,
      sampleTweetForProfile0: {
        profileId: profileIds[0],
        tweets: sampleTweet?.map(t => ({ 
          id: t.id, 
          handle: t.twitter_handle, 
          posted_at: t.posted_at,
          profile_id: t.profile_id 
        })),
        error: sampleError?.message
      },
      latestTweetsGlobal: latestTweetGlobal?.map(t => ({
        handle: t.twitter_handle,
        posted_at: t.posted_at,
        profile_id: t.profile_id,
        snippet: t.content?.slice(0, 80)
      })),
      timestamps: {
        now: dayjs().toISOString(),
        since48h,
        since7d
      }
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
