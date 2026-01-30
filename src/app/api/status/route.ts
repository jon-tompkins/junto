import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// GET /api/status - Get system status and next scheduled runs
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  
  try {
    // Get user's settings if userId provided
    let userSettings = null;
    if (userId) {
      const { data } = await supabase
        .from('users')
        .select('email, settings')
        .eq('id', userId)
        .single();
      userSettings = data;
    }
    
    // Get all active profiles being tracked
    const { data: profiles } = await supabase
      .from('profiles')
      .select('twitter_handle, last_fetched_at, tweet_count')
      .order('last_fetched_at', { ascending: false });
    
    // Get recent newsletters count (last 7 days)
    const weekAgo = dayjs().subtract(7, 'day').toISOString();
    const { count: recentNewsletters } = await supabase
      .from('newsletters')
      .select('id', { count: 'exact' })
      .gte('created_at', weekAgo);
    
    // Get total tweets in DB
    const { count: totalTweets } = await supabase
      .from('tweets')
      .select('id', { count: 'exact' });
    
    // Calculate next run time for user
    let nextRun = null;
    if (userSettings?.settings) {
      const userTimezone = userSettings.settings.timezone || 'America/New_York';
      const deliveryTime = userSettings.settings.delivery_time || '05:00';
      const [hour, minute] = deliveryTime.split(':').map(Number);
      
      const now = dayjs().tz(userTimezone);
      let next = now.hour(hour).minute(minute).second(0);
      
      // If time has passed today, schedule for tomorrow
      if (next.isBefore(now)) {
        next = next.add(1, 'day');
      }
      
      nextRun = {
        local: next.format('YYYY-MM-DD HH:mm'),
        timezone: userTimezone,
        utc: next.utc().format('YYYY-MM-DD HH:mm'),
      };
    }
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      user: userSettings ? {
        email: userSettings.email,
        timezone: userSettings.settings?.timezone || 'America/New_York',
        delivery_time: userSettings.settings?.delivery_time || '05:00',
        next_newsletter: nextRun,
      } : null,
      system: {
        profiles_tracked: profiles?.length || 0,
        newsletters_last_7d: recentNewsletters || 0,
        total_tweets: totalTweets || 0,
        cron_schedule: '0 * * * * (hourly)',
      },
      data_sources: profiles?.slice(0, 10).map(p => ({
        handle: `@${p.twitter_handle}`,
        last_fetch: p.last_fetched_at,
        tweets: p.tweet_count,
      })) || [],
    });
    
  } catch (error) {
    console.error('Error fetching status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', status: 'error' },
      { status: 500 }
    );
  }
}
