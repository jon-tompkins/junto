import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes max for Vercel

// Types
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
  raw_data?: any;
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
  author: {
    username: string;
    name: string;
    followers_count?: number;
  };
  authorId: string;
}

// Quality filter functions
function hasSpamPatterns(author: { username: string; name: string }): boolean {
  const name = author.name.toLowerCase();
  const handle = author.username.toLowerCase();
  
  if (name.includes('🚀')) return true;
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

function calculateQualityScore(likes: number, retweets: number, followers: number): number {
  return followers + (likes * 10) + (retweets * 20);
}

function processTweets(tweets: BirdTweet[], ticker: string): WatchlistTweet[] {
  const qualityTweets: WatchlistTweet[] = [];
  
  for (const tweet of tweets) {
    // Skip replies
    if (tweet.inReplyToStatusId) continue;
    
    // Skip spam
    if (hasSpamPatterns(tweet.author)) continue;
    if (hasSpamPhrases(tweet.text)) continue;
    
    const followerCount = tweet.author.followers_count || 0;
    
    // Minimum follower threshold (skip check if follower count unknown)
    if (followerCount > 0 && followerCount < 500) continue;
    
    // Require some engagement if no follower data
    if (followerCount === 0 && tweet.likeCount < 2 && tweet.retweetCount < 1) continue;
    
    const qualityScore = calculateQualityScore(
      tweet.likeCount,
      tweet.retweetCount,
      followerCount
    );
    
    qualityTweets.push({
      ticker: ticker.toUpperCase(),
      tweet_id: tweet.id,
      author_handle: tweet.author.username,
      author_name: tweet.author.name,
      author_followers: followerCount,
      content: tweet.text,
      posted_at: new Date(tweet.createdAt).toISOString(),
      likes: tweet.likeCount,
      retweets: tweet.retweetCount,
      quality_score: qualityScore,
      raw_data: tweet
    });
  }
  
  // Sort by quality and take top 10
  return qualityTweets
    .sort((a, b) => b.quality_score - a.quality_score)
    .slice(0, 10);
}

// POST: Receive tweets from external scraper (Ubuntu server with bird CLI)
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { ticker, tweets } = body as { ticker: string; tweets: BirdTweet[] };
    
    if (!ticker || !tweets) {
      return NextResponse.json({ error: 'Missing ticker or tweets' }, { status: 400 });
    }
    
    // Process and filter tweets
    const qualityTweets = processTweets(tweets, ticker);
    
    if (qualityTweets.length === 0) {
      return NextResponse.json({ 
        success: true, 
        stored: 0,
        message: `No quality tweets found for ${ticker}`
      });
    }
    
    // Store in Supabase
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('watchlist_tweets')
      .upsert(qualityTweets, {
        onConflict: 'tweet_id',
        ignoreDuplicates: true
      })
      .select();
    
    if (error) {
      console.error('Error storing watchlist tweets:', error);
      return NextResponse.json({ error: 'Failed to store tweets' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      ticker,
      processed: tweets.length,
      stored: data?.length || 0
    });
    
  } catch (error) {
    console.error('Watchlist scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET: Return list of tickers to scrape (for external scraper)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = getSupabase();
    
    // Get unique tickers from all user watchlists
    const { data, error } = await supabase
      .from('user_watchlist')
      .select('ticker')
      .order('ticker');
    
    if (error) {
      console.error('Error fetching tickers:', error);
      return NextResponse.json({ error: 'Failed to fetch tickers' }, { status: 500 });
    }
    
    const tickers = Array.from(new Set(data.map(row => row.ticker)));
    
    return NextResponse.json({
      success: true,
      tickers,
      count: tickers.length
    });
    
  } catch (error) {
    console.error('Watchlist tickers error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE: Cleanup old tweets
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = getSupabase();
    
    // Remove tweets older than 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    
    const { error, count } = await supabase
      .from('watchlist_tweets')
      .delete()
      .lt('posted_at', cutoffDate.toISOString());
    
    if (error) {
      console.error('Error cleaning up old tweets:', error);
      return NextResponse.json({ error: 'Failed to cleanup' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      deleted: count || 0
    });
    
  } catch (error) {
    console.error('Watchlist cleanup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
