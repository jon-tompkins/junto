#!/usr/bin/env node

import { execSync } from 'child_process';
import { getSupabase } from '../src/lib/db/client';
import dayjs from 'dayjs';

// Types for bird-auth response
interface BirdTweetAuthor {
  username: string;
  name: string;
}

interface BirdTweet {
  id: string;
  text: string;
  createdAt: string;
  replyCount: number;
  retweetCount: number;
  likeCount: number;
  conversationId: string;
  inReplyToStatusId?: string;
  author: BirdTweetAuthor;
  authorId: string;
}

interface WatchlistTweet {
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
  raw_data: any;
}

// Quality filter functions
function hasSpamPatterns(author: BirdTweetAuthor): boolean {
  const name = author.name.toLowerCase();
  const handle = author.username.toLowerCase();
  
  // Check for rocket emojis in name
  if (name.includes('🚀')) return true;
  
  // Check for spam keywords in handle
  if (handle.includes('signal') || handle.includes('alert')) return true;
  
  return false;
}

function hasSpamPhrases(text: string): boolean {
  const lowerText = text.toLowerCase();
  const spamPhrases = [
    "don't miss",
    "next move", 
    "🚀🚀🚀",
    "comment \"in\"",
    "dm me",
    "join now",
    "limited time",
    "free signals"
  ];
  
  return spamPhrases.some(phrase => lowerText.includes(phrase));
}

async function getAuthorFollowers(username: string): Promise<number> {
  try {
    // Use the existing Twitter user API to get follower count
    const response = await fetch(`http://localhost:3000/api/twitter/user?handle=${username}`);
    if (response.ok) {
      const data = await response.json();
      return data.user?.public_metrics?.followers_count || 0;
    }
  } catch (error) {
    console.error(`Failed to get follower count for ${username}:`, error);
  }
  return 0;
}

function calculateQualityScore(tweet: BirdTweet, followerCount: number): number {
  // Score formula: followers + (likes * 10) + (retweets * 20)
  return followerCount + (tweet.likeCount * 10) + (tweet.retweetCount * 20);
}

async function fetchTweetsForTicker(ticker: string): Promise<WatchlistTweet[]> {
  console.log(`Fetching tweets for ticker: ${ticker}`);
  
  try {
    // Use bird-auth to search for the ticker
    const command = `~/bin/bird-auth search '${ticker}' -n 30 --json`;
    const output = execSync(command, { encoding: 'utf-8' });
    const tweets: BirdTweet[] = JSON.parse(output);
    
    const qualityTweets: WatchlistTweet[] = [];
    
    for (const tweet of tweets) {
      // Skip replies to reduce noise
      if (tweet.inReplyToStatusId) continue;
      
      // Check for spam patterns
      if (hasSpamPatterns(tweet.author)) continue;
      if (hasSpamPhrases(tweet.text)) continue;
      
      // Get follower count
      const followerCount = await getAuthorFollowers(tweet.author.username);
      
      // Minimum follower threshold
      if (followerCount < 500) continue;
      
      // Calculate quality score
      const qualityScore = calculateQualityScore(tweet, followerCount);
      
      // Parse posted_at (handle potential date format issues)
      let postedAt: string;
      try {
        postedAt = dayjs(tweet.createdAt).toISOString();
      } catch (error) {
        console.warn(`Invalid date format for tweet ${tweet.id}: ${tweet.createdAt}`);
        postedAt = dayjs().toISOString(); // Fallback to now
      }
      
      qualityTweets.push({
        ticker: ticker.toUpperCase(),
        tweet_id: tweet.id,
        author_handle: tweet.author.username,
        author_name: tweet.author.name,
        author_followers: followerCount,
        content: tweet.text,
        posted_at: postedAt,
        likes: tweet.likeCount,
        retweets: tweet.retweetCount,
        quality_score: qualityScore,
        raw_data: tweet
      });
      
      // Add small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Sort by quality score and take top 10
    return qualityTweets
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, 10);
      
  } catch (error) {
    console.error(`Error fetching tweets for ${ticker}:`, error);
    return [];
  }
}

async function storeWatchlistTweets(tweets: WatchlistTweet[]): Promise<void> {
  if (tweets.length === 0) return;
  
  const supabase = getSupabase();
  
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
  
  console.log(`Stored ${data?.length || 0} tweets`);
}

async function getAllWatchlistTickers(): Promise<string[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('user_watchlist')
    .select('ticker')
    .order('ticker');
  
  if (error) {
    console.error('Error fetching watchlist tickers:', error);
    throw error;
  }
  
  // Get unique tickers
  const tickers = Array.from(new Set(data.map(row => row.ticker)));
  return tickers;
}

async function cleanupOldTweets(): Promise<void> {
  const supabase = getSupabase();
  
  // Remove tweets older than 30 days
  const cutoffDate = dayjs().subtract(30, 'day').toISOString();
  
  const { error } = await supabase
    .from('watchlist_tweets')
    .delete()
    .lt('posted_at', cutoffDate);
  
  if (error) {
    console.error('Error cleaning up old tweets:', error);
  } else {
    console.log('Cleaned up old tweets');
  }
}

async function main(): Promise<void> {
  try {
    console.log('Starting watchlist tweet fetcher...');
    
    // Get all tickers from user watchlists
    const tickers = await getAllWatchlistTickers();
    console.log(`Found ${tickers.length} tickers to process: ${tickers.join(', ')}`);
    
    if (tickers.length === 0) {
      console.log('No tickers found in watchlists');
      return;
    }
    
    let totalTweets = 0;
    
    // Fetch tweets for each ticker
    for (const ticker of tickers) {
      const tweets = await fetchTweetsForTicker(ticker);
      if (tweets.length > 0) {
        await storeWatchlistTweets(tweets);
        totalTweets += tweets.length;
        console.log(`Processed ${tweets.length} tweets for ${ticker}`);
      } else {
        console.log(`No quality tweets found for ${ticker}`);
      }
      
      // Add delay between tickers to be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Cleanup old tweets
    await cleanupOldTweets();
    
    console.log(`✅ Completed! Processed ${totalTweets} total tweets across ${tickers.length} tickers`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as fetchWatchlistTweets };