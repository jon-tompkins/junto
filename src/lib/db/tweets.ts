import { getSupabase } from './client';
import { Tweet, GroupedTweets } from '@/types';

export async function storeTweets(
  profileId: string,
  tweets: Omit<Tweet, 'id' | 'profile_id' | 'fetched_at'>[]
): Promise<number> {
  if (tweets.length === 0) return 0;
  
  const supabase = getSupabase();
  
  const tweetsToInsert = tweets.map((tweet) => ({
    ...tweet,
    profile_id: profileId,
  }));
  
  // Upsert to handle duplicates gracefully
  const { data, error } = await supabase
    .from('tweets')
    .upsert(tweetsToInsert, {
      onConflict: 'twitter_id',
      ignoreDuplicates: true,
    })
    .select();
  
  if (error) {
    console.error('Error storing tweets:', error);
    throw error;
  }
  
  return data?.length || 0;
}

export async function getTweetsSince(
  profileId: string,
  since: string
): Promise<Tweet[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('tweets')
    .select('*')
    .eq('profile_id', profileId)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching tweets:', error);
    throw error;
  }
  
  return data || [];
}

export async function getRecentTweets(hoursAgo = 24): Promise<Tweet[]> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('tweets')
    .select('*')
    .gte('posted_at', since)
    .eq('is_retweet', false) // Exclude pure retweets
    .order('posted_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching recent tweets:', error);
    throw error;
  }
  
  return data || [];
}

export async function getRecentTweetsGrouped(hoursAgo = 24): Promise<GroupedTweets> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  
  // Fetch tweets with profile info
  const { data, error } = await supabase
    .from('tweets')
    .select(`
      *,
      profiles:profile_id (twitter_handle)
    `)
    .gte('posted_at', since)
    .eq('is_retweet', false)
    .order('posted_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching grouped tweets:', error);
    throw error;
  }
  
  // Group by handle
  const grouped: GroupedTweets = {};
  
  for (const tweet of data || []) {
    const handle = (tweet.profiles as { twitter_handle: string })?.twitter_handle;
    if (!handle) continue;
    
    if (!grouped[handle]) {
      grouped[handle] = [];
    }
    
    grouped[handle].push({
      content: tweet.content,
      likes: tweet.likes,
      retweets: tweet.retweets,
      posted_at: tweet.posted_at,
      quoted_tweet_content: tweet.quoted_tweet_content || undefined,
      thread_id: tweet.thread_id || undefined,
      thread_position: tweet.thread_position || undefined,
    });
  }
  
  return grouped;
}

export async function getTweetsByIds(ids: string[]): Promise<Tweet[]> {
  if (ids.length === 0) return [];
  
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('tweets')
    .select('*')
    .in('id', ids);
  
  if (error) {
    console.error('Error fetching tweets by IDs:', error);
    throw error;
  }
  
  return data || [];
}
