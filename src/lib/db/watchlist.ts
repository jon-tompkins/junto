import { getSupabase } from './client';

export interface WatchlistItem {
  user_id: string;
  ticker: string;
  created_at: string;
}

export interface WatchlistTweet {
  id: string;
  ticker: string;
  tweet_id: string;
  author_handle: string;
  author_name: string;
  author_followers: number;
  content: string;
  posted_at: string;
  likes: number;
  retweets: number;
  quality_score: number;
  created_at: string;
  raw_data?: any;
}

export async function getUserWatchlist(userId: string): Promise<WatchlistItem[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('user_watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('ticker');
  
  if (error) {
    console.error('Error fetching user watchlist:', error);
    throw error;
  }
  
  return data || [];
}

export async function addToWatchlist(userId: string, ticker: string): Promise<WatchlistItem> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('user_watchlist')
    .insert({
      user_id: userId,
      ticker: ticker.toUpperCase()
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error adding to watchlist:', error);
    throw error;
  }
  
  return data;
}

export async function removeFromWatchlist(userId: string, ticker: string): Promise<void> {
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('ticker', ticker.toUpperCase());
  
  if (error) {
    console.error('Error removing from watchlist:', error);
    throw error;
  }
}

export async function getAllWatchlistTickers(): Promise<string[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('user_watchlist')
    .select('ticker')
    .order('ticker');
  
  if (error) {
    console.error('Error fetching all watchlist tickers:', error);
    throw error;
  }
  
  // Get unique tickers
  const tickers = Array.from(new Set(data?.map(row => row.ticker) || []));
  return tickers;
}

export async function getWatchlistTweets(tickers: string[], daysBack: number = 7, limit: number = 50): Promise<WatchlistTweet[]> {
  const supabase = getSupabase();
  
  if (tickers.length === 0) return [];
  
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);
  
  const { data, error } = await supabase
    .from('watchlist_tweets')
    .select('*')
    .in('ticker', tickers)
    .gte('posted_at', sinceDate.toISOString())
    .order('quality_score', { ascending: false })
    .order('posted_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching watchlist tweets:', error);
    throw error;
  }
  
  return data || [];
}

export async function storeWatchlistTweets(tweets: Partial<WatchlistTweet>[]): Promise<number> {
  const supabase = getSupabase();
  
  if (tweets.length === 0) return 0;
  
  const { data, error } = await supabase
    .from('watchlist_tweets')
    .upsert(tweets, {
      onConflict: 'tweet_id',
      ignoreDuplicates: true
    })
    .select();
  
  if (error) {
    console.error('Error storing watchlist tweets:', error);
    throw error;
  }
  
  return data?.length || 0;
}

export async function cleanupOldWatchlistTweets(daysToKeep: number = 30): Promise<void> {
  const supabase = getSupabase();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const { error } = await supabase
    .from('watchlist_tweets')
    .delete()
    .lt('posted_at', cutoffDate.toISOString());
  
  if (error) {
    console.error('Error cleaning up old watchlist tweets:', error);
    throw error;
  }
}

export async function getUserWatchlistTweets(userId: string, daysBack: number = 7, limit: number = 50): Promise<{
  tweets: WatchlistTweet[];
  tweetsByTicker: Record<string, WatchlistTweet[]>;
  watchlistTickers: string[];
}> {
  // Get user's watchlist
  const watchlist = await getUserWatchlist(userId);
  const tickers = watchlist.map(w => w.ticker);
  
  if (tickers.length === 0) {
    return {
      tweets: [],
      tweetsByTicker: {},
      watchlistTickers: []
    };
  }
  
  // Get tweets for those tickers
  const tweets = await getWatchlistTweets(tickers, daysBack, limit);
  
  // Group by ticker
  const tweetsByTicker: Record<string, WatchlistTweet[]> = {};
  for (const tweet of tweets) {
    if (!tweetsByTicker[tweet.ticker]) {
      tweetsByTicker[tweet.ticker] = [];
    }
    tweetsByTicker[tweet.ticker].push(tweet);
  }
  
  return {
    tweets,
    tweetsByTicker,
    watchlistTickers: tickers
  };
}