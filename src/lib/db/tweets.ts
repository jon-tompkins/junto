import { getSupabase } from './client';
import { Tweet, GroupedTweets } from '@/types';
import dayjs from 'dayjs';

export async function storeTweets(profileId: string, tweets: Partial<Tweet>[]): Promise<number> {
  const supabase = getSupabase();
  
  const tweetsToInsert = tweets.map(tweet => ({
    ...tweet,
    profile_id: profileId,
  }));
  
  const { data, error } = await supabase
    .from('tweets')
    .upsert(tweetsToInsert, { 
      onConflict: 'twitter_id',
      ignoreDuplicates: true 
    })
    .select();
  
  if (error) {
    console.error('Error storing tweets:', error);
    throw error;
  }
  
  // Return count of tweets stored/updated
  return data?.length || 0;
}

export async function getRecentTweetsGrouped(hoursAgo: number = 24): Promise<GroupedTweets> {
  const supabase = getSupabase();
  const since = dayjs().subtract(hoursAgo, 'hour').toISOString();
  
  const { data: tweets, error } = await supabase
    .from('tweets')
    .select(`
      *,
      profiles!inner(twitter_handle)
    `)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching tweets:', error);
    // Return empty instead of throwing - allows system to continue
    if (error.code === 'PGRST205') {
      console.warn('tweets table does not exist - run migrations');
      return {};
    }
    throw error;
  }
  
  // Group by handle
  const grouped: GroupedTweets = {};
  for (const tweet of tweets || []) {
    const handle = tweet.profiles?.twitter_handle;
    if (handle) {
      if (!grouped[handle]) {
        grouped[handle] = [];
      }
      grouped[handle].push(tweet);
    }
  }
  
  return grouped;
}

// Get older tweets for context (excluding recent ones)
export async function getTweetsForContext(
  contextDays: number = 180, 
  excludeRecentHours: number = 48
): Promise<GroupedTweets> {
  const supabase = getSupabase();
  
  const contextStart = dayjs().subtract(contextDays, 'day').toISOString();
  const recentCutoff = dayjs().subtract(excludeRecentHours, 'hour').toISOString();
  
  const { data: tweets, error } = await supabase
    .from('tweets')
    .select(`
      *,
      profiles!inner(twitter_handle)
    `)
    .gte('posted_at', contextStart)
    .lt('posted_at', recentCutoff)
    .order('posted_at', { ascending: false })
    .limit(500); // Limit context tweets to avoid token overflow
  
  if (error) {
    console.error('Error fetching context tweets:', error);
    // Return empty instead of throwing - allows system to continue
    if (error.code === 'PGRST205') {
      console.warn('tweets table does not exist - run migrations');
      return {};
    }
    throw error;
  }
  
  // Group by handle
  const grouped: GroupedTweets = {};
  for (const tweet of tweets || []) {
    const handle = tweet.profiles?.twitter_handle;
    if (handle) {
      if (!grouped[handle]) {
        grouped[handle] = [];
      }
      grouped[handle].push(tweet);
    }
  }
  
  return grouped;
}

export async function getTweetsByProfileId(profileId: string, limit: number = 100) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('tweets')
    .select('*')
    .eq('profile_id', profileId)
    .order('posted_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching tweets:', error);
    throw error;
  }
  
  return data;
}

export async function getLatestTweetByProfile(profileId: string) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('tweets')
    .select('*')
    .eq('profile_id', profileId)
    .order('posted_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching latest tweet:', error);
    throw error;
  }
  
  return data;
}
