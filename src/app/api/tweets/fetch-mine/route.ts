import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { storeTweets } from '@/lib/db/tweets';
import { fetchTweetsForProfile } from '@/lib/twitter/client';
import { updateProfileFetchTime } from '@/lib/db/profiles';

export const maxDuration = 120; // 2 minutes

// Fetch tweets for the authenticated user's selected profiles
export async function POST() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    
    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_handle', twitterHandle)
      .single();
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Get user's selected profiles
    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('profiles(id, twitter_handle)')
      .eq('user_id', user.id);
    
    const profiles = userProfiles
      ?.map((p: any) => p.profiles)
      .filter(Boolean) || [];
    
    if (profiles.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No profiles selected. Add profiles in Sources first.',
      });
    }
    
    console.log(`Fetching tweets for ${twitterHandle}'s ${profiles.length} profiles...`);
    
    const results: Record<string, { fetched: number; stored: number; error?: string }> = {};
    let totalFetched = 0;
    let totalStored = 0;
    
    for (const profile of profiles) {
      try {
        console.log(`Processing @${profile.twitter_handle}...`);
        
        const tweets = await fetchTweetsForProfile(profile.twitter_handle, 30);
        const stored = await storeTweets(profile.id, tweets);
        await updateProfileFetchTime(profile.id);
        
        results[profile.twitter_handle] = {
          fetched: tweets.length,
          stored,
        };
        
        totalFetched += tweets.length;
        totalStored += stored;
        
        console.log(`@${profile.twitter_handle}: fetched ${tweets.length}, stored ${stored} new`);
        
      } catch (error) {
        console.error(`Error fetching @${profile.twitter_handle}:`, error);
        results[profile.twitter_handle] = {
          fetched: 0,
          stored: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
    
    return NextResponse.json({
      success: true,
      profiles: profiles.length,
      totalFetched,
      totalStored,
      results,
    });
    
  } catch (error) {
    console.error('Error in user tweet fetch:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
