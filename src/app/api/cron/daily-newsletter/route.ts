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
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const maxDuration = 300; // 5 minutes

interface User {
  id: string;
  email: string;
  twitter_handle: string;
  settings: {
    keywords?: string[];
    delivery_time?: string;
    timezone?: string;
    use_custom_time?: boolean;
  } | null;
  custom_prompt: string | null;
}

// Get users who should receive newsletter at the current time in their timezone
async function getUsersForCurrentTime(): Promise<User[]> {
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
  const filteredUsers = users.filter(u => u.email) as User[];
  
  // Check each user's local time
  const usersForCurrentTime: User[] = [];
  
  for (const user of filteredUsers) {
    const userTimezone = user.settings?.timezone || 'America/New_York';
    const deliveryTime = user.settings?.delivery_time || '05:00';
    
    // Get current time in user's timezone
    const nowInUserTimezone = dayjs().tz(userTimezone);
    const [hour, minute] = deliveryTime.split(':').map(Number);
    
    // Check if current time matches delivery time (within same hour)
    const currentHour = nowInUserTimezone.hour();
    const currentMinute = nowInUserTimezone.minute();
    
    // Allow 5-minute window for delivery
    const isDeliveryTime = Math.abs(currentHour - hour) === 0 && Math.abs(currentMinute - minute) < 5;
    
    // Check if we've already sent a newsletter today to this user
    const today = nowInUserTimezone.format('YYYY-MM-DD');
    const alreadySentToday = await checkIfNewsletterSentToday(user.id, today);
    
    if (isDeliveryTime && !alreadySentToday) {
      usersForCurrentTime.push(user);
      console.log(`User ${user.email} scheduled for ${deliveryTime} ${userTimezone}, current local time: ${nowInUserTimezone.format('HH:mm')}`);
    }
  }
  
  return usersForCurrentTime;
}

// Check if newsletter was already sent to user today
async function checkIfNewsletterSentToday(userId: string, today: string): Promise<boolean> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('newsletters')
    .select('id, sent_at')
    .eq('user_id', userId)
    .gte('sent_at', today + 'T00:00:00.000Z')
    .lt('sent_at', today + 'T23:59:59.999Z')
    .limit(1);
  
  if (error) {
    console.error('Error checking newsletter status:', error);
    return false;
  }
  
  return (data?.length || 0) > 0;
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
    console.log('Starting newsletter cron with timezone-aware scheduling...');
    
    // Get users for current time in their respective timezones
    const users = await getUsersForCurrentTime();
    
    if (users.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No users scheduled for current time',
      });
    }
    
    console.log(`Found ${users.length} users for current time across all timezones`);
    
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
