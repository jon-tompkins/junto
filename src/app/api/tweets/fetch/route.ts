import { NextRequest, NextResponse } from 'next/server';
import { getActiveProfiles, seedInitialProfiles, updateProfileFetchTime } from '@/lib/db/profiles';
import { storeTweets } from '@/lib/db/tweets';
import { fetchTweetsForProfile } from '@/lib/twitter/client';

export const maxDuration = 300; // 5 minutes - fetching can take a while

// POST to fetch tweets for all profiles
export async function POST(request: NextRequest) {
  try {
    // Optional: seed profiles if none exist
    const body = await request.json().catch(() => ({}));
    const shouldSeed = body.seed === true;
    
    if (shouldSeed) {
      console.log('Seeding initial profiles...');
      await seedInitialProfiles();
    }
    
    const profiles = await getActiveProfiles();
    
    if (profiles.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No profiles found. Call with {"seed": true} to add initial profiles.',
      });
    }
    
    console.log(`Fetching tweets for ${profiles.length} profiles...`);
    
    const results: Record<string, { fetched: number; stored: number; error?: string }> = {};
    
    for (const profile of profiles) {
      try {
        console.log(`\nProcessing @${profile.twitter_handle}...`);
        
        const tweets = await fetchTweetsForProfile(profile.twitter_handle, 30);
        const stored = await storeTweets(profile.id, tweets);
        await updateProfileFetchTime(profile.id);
        
        results[profile.twitter_handle] = {
          fetched: tweets.length,
          stored,
        };
        
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
      results,
    });
    
  } catch (error) {
    console.error('Error in tweet fetch:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET for simple trigger
export async function GET() {
  return NextResponse.json({
    message: 'Use POST to fetch tweets. Add {"seed": true} to create initial profiles first.',
    example: 'curl -X POST http://localhost:3000/api/tweets/fetch -H "Content-Type: application/json" -d \'{"seed": true}\'',
  });
}
