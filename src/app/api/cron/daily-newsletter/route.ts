import { NextRequest, NextResponse } from 'next/server';
import { getRecentTweetsGrouped, getTweetsForContext, storeTweets } from '@/lib/db/tweets';
import { getActiveProfiles, updateProfileFetchTime } from '@/lib/db/profiles';
import { fetchTweetsForProfile } from '@/lib/twitter/client';
import { storeNewsletter, updateNewsletterSentStatus } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { sendNewsletter } from '@/lib/email/sender';
import { config } from '@/lib/utils/config';
import { getDateRange } from '@/lib/utils/date';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes

interface User {
  id: string;
  email: string;
  twitter_handle: string;
  settings: {
    keywords?: string[];
    delivery_time?: string;
  } | null;
  custom_prompt: string | null;
}

// Map delivery_time setting to slot hour
const TIME_SLOT_MAP: Record<string, number> = {
  '05:00': 5,
  '11:00': 11,
  '17:00': 17,
  '23:00': 23,
};

// Get users who should receive newsletter at this slot
async function getUsersForSlot(slot: number | null): Promise<User[]> {
  const supabase = getSupabase();
  
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, twitter_handle, settings, custom_prompt')
    .eq('has_access', true)
    .not('email', 'is', null);
  
  if (error || !users) {
    console.error('Error fetching users:', error);
    return [];
  }
  
  // Filter to users with email
  let filteredUsers = users.filter(u => u.email) as User[];
  
  // If slot is specified, filter to users who want that time
  if (slot !== null) {
    filteredUsers = filteredUsers.filter(user => {
      const deliveryTime = user.settings?.delivery_time || '05:00';
      const userSlot = TIME_SLOT_MAP[deliveryTime] || 5;
      return userSlot === slot;
    });
  }
  
  return filteredUsers;
}

// Get a user's selected profile handles
async function getUserProfiles(userId: string): Promise<string[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('profiles(twitter_handle)')
    .eq('user_id', userId);
  
  if (error || !data) return [];
  
  return data.map((row: any) => row.profiles?.twitter_handle).filter(Boolean);
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (config.app.cronSecret && authHeader !== `Bearer ${config.app.cronSecret}`) {
    const cronHeader = request.headers.get('x-vercel-cron');
    if (!cronHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Get slot from query param (5, 11, 17, or 23)
    const { searchParams } = new URL(request.url);
    const slotParam = searchParams.get('slot');
    const slot = slotParam ? parseInt(slotParam) : null;
    
    console.log(`Starting newsletter cron for slot: ${slot || 'all'}...`);
    
    // Get users for this time slot
    const users = await getUsersForSlot(slot);
    
    if (users.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: `No users scheduled for slot ${slot || 'all'}`,
        slot,
      });
    }
    
    console.log(`Found ${users.length} users for slot ${slot || 'all'}`);
    
    // Step 1: Fetch fresh tweets for all active profiles
    console.log('Fetching fresh tweets...');
    const profiles = await getActiveProfiles();
    let totalFetched = 0;
    
    for (const profile of profiles) {
      try {
        const tweets = await fetchTweetsForProfile(profile.twitter_handle, 30);
        await storeTweets(profile.id, tweets);
        await updateProfileFetchTime(profile.id);
        totalFetched += tweets.length;
      } catch (error) {
        console.error(`Error fetching @${profile.twitter_handle}:`, error);
      }
    }
    
    console.log(`Fetched ${totalFetched} tweets from ${profiles.length} profiles`);
    
    // Step 2: Get all tweets (we'll filter per user)
    const recentHours = 48;
    const contextDays = 180;
    const { start, end } = getDateRange(recentHours);
    
    const allRecentTweets = await getRecentTweetsGrouped(recentHours);
    const allContextTweets = await getTweetsForContext(contextDays, recentHours);
    
    // Step 3: Generate and send newsletter for each user
    const results: Record<string, { success: boolean; error?: string }> = {};
    
    for (const user of users) {
      try {
        console.log(`Processing newsletter for ${user.email}...`);
        
        // Get user's selected profiles
        const userProfileHandles = await getUserProfiles(user.id);
        
        if (userProfileHandles.length === 0) {
          console.log(`User ${user.email} has no profiles selected, skipping`);
          results[user.email] = { success: false, error: 'No profiles selected' };
          continue;
        }
        
        // Filter tweets to only user's selected profiles
        const recentTweets: Record<string, any[]> = {};
        const contextTweets: Record<string, any[]> = {};
        
        for (const handle of userProfileHandles) {
          if (allRecentTweets[handle]) {
            recentTweets[handle] = allRecentTweets[handle];
          }
          if (allContextTweets[handle]) {
            contextTweets[handle] = allContextTweets[handle];
          }
        }
        
        const recentCount = Object.values(recentTweets).reduce((sum, arr) => sum + arr.length, 0);
        const contextCount = Object.values(contextTweets).reduce((sum, arr) => sum + arr.length, 0);
        
        if (recentCount === 0 && contextCount === 0) {
          console.log(`No tweets found for ${user.email}'s profiles`);
          results[user.email] = { success: false, error: 'No tweets found' };
          continue;
        }
        
        // Get user's keywords and custom prompt
        const keywords = user.settings?.keywords || [];
        const customPrompt = user.custom_prompt || null;
        
        // Generate newsletter with user's settings
        const synthesis = await generateNewsletter(
          recentTweets, 
          start, 
          end, 
          contextTweets,
          keywords,
          customPrompt
        );
        
        // Store newsletter with user_id
        const newsletter = await storeNewsletter({
          user_id: user.id,
          subject: synthesis.subject,
          content: synthesis.content,
          tweet_ids: [],
          tweet_count: recentCount + contextCount,
          date_range_start: start,
          date_range_end: end,
          model_used: 'claude-sonnet-4-20250514',
          prompt_version: PROMPT_VERSION,
          input_tokens: synthesis.input_tokens,
          output_tokens: synthesis.output_tokens,
          sent_at: null,
          sent_to: [],
          metadata: {
            recent_tweets: recentCount,
            context_tweets: contextCount,
            profiles: userProfileHandles,
            keywords,
            slot,
          },
        });
        
        // Send email
        await sendNewsletter({
          to: user.email,
          subject: synthesis.subject,
          content: synthesis.content,
        });
        
        await updateNewsletterSentStatus(newsletter.id, [user.email]);
        
        console.log(`Newsletter sent to ${user.email}`);
        results[user.email] = { success: true };
        
      } catch (error) {
        console.error(`Error processing ${user.email}:`, error);
        results[user.email] = { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    }
    
    const successCount = Object.values(results).filter(r => r.success).length;
    
    return NextResponse.json({
      success: true,
      slot,
      usersProcessed: users.length,
      newslettersSent: successCount,
      tweetsFetched: totalFetched,
      results,
    });
    
  } catch (error) {
    console.error('Error in newsletter cron:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
