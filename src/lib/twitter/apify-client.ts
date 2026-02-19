/**
 * Apify Twitter Scraper Client
 * Uses kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest
 * $0.25 per 1000 tweets
 */

export interface ApifyTweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  author: {
    userName: string;
    name: string;
    followers?: number;
  };
  conversationId?: string;
  inReplyToStatusId?: string;
  quotedTweet?: {
    text: string;
  };
}

export interface FetchedTweet {
  twitter_id: string;
  content: string;
  posted_at: string;
  likes: number;
  retweets: number;
  replies: number;
  is_retweet: boolean;
  is_reply: boolean;
  is_quote_tweet: boolean;
  quoted_tweet_content: string | null;
  thread_id: string | null;
  thread_position: number | null;
  raw_data: Record<string, unknown>;
}

const APIFY_ACTOR_ID = 'kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest';
const APIFY_BASE_URL = 'https://api.apify.com/v2';

async function waitForRun(runId: string, token: string, maxWaitMs = 60000): Promise<any[]> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const statusRes = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`
    );
    const statusData = await statusRes.json();
    
    if (statusData.data?.status === 'SUCCEEDED') {
      // Get results
      const resultsRes = await fetch(
        `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items?token=${token}`
      );
      const results = await resultsRes.json();
      // Filter out mock tweets
      return results.filter((r: any) => r.type !== 'mock_tweet');
    }
    
    if (statusData.data?.status === 'FAILED' || statusData.data?.status === 'ABORTED') {
      throw new Error(`Apify run failed: ${statusData.data?.status}`);
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Apify run timed out');
}

export async function fetchTweetsFromProfile(
  handle: string,
  maxTweets = 30
): Promise<FetchedTweet[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN not configured');
  }
  
  const cleanHandle = handle.replace('@', '');
  console.log(`[Apify] Fetching tweets for @${cleanHandle}...`);
  
  // Start the run with from:username search
  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchTerms: [`from:${cleanHandle}`],
        tweetsDesired: maxTweets
      })
    }
  );
  
  const runData = await runRes.json();
  const runId = runData.data?.id;
  
  if (!runId) {
    throw new Error('Failed to start Apify run');
  }
  
  console.log(`[Apify] Run started: ${runId}`);
  
  // Wait for results
  const tweets = await waitForRun(runId, token);
  console.log(`[Apify] Got ${tweets.length} tweets for @${cleanHandle}`);
  
  // Transform to our format
  return tweets.map((tweet: any, index: number) => {
    const isRetweet = tweet.text?.startsWith('RT @') || false;
    const isReply = !!tweet.inReplyToStatusId;
    const isQuote = !!tweet.quotedTweet;
    
    return {
      twitter_id: tweet.id?.toString() || '',
      content: tweet.text || '',
      posted_at: parseDate(tweet.createdAt),
      likes: tweet.likeCount || 0,
      retweets: tweet.retweetCount || 0,
      replies: tweet.replyCount || 0,
      is_retweet: isRetweet,
      is_reply: isReply,
      is_quote_tweet: isQuote,
      quoted_tweet_content: tweet.quotedTweet?.text || null,
      thread_id: tweet.conversationId?.toString() || null,
      thread_position: tweet.conversationId ? index : null,
      raw_data: tweet as Record<string, unknown>,
    };
  });
}

export async function searchTweets(
  query: string,
  maxTweets = 30
): Promise<FetchedTweet[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN not configured');
  }
  
  console.log(`[Apify] Searching for "${query}"...`);
  
  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchTerms: [query],
        tweetsDesired: maxTweets
      })
    }
  );
  
  const runData = await runRes.json();
  const runId = runData.data?.id;
  
  if (!runId) {
    throw new Error('Failed to start Apify run');
  }
  
  const tweets = await waitForRun(runId, token);
  console.log(`[Apify] Got ${tweets.length} tweets for "${query}"`);
  
  return tweets.map((tweet: any, index: number) => ({
    twitter_id: tweet.id?.toString() || '',
    content: tweet.text || '',
    posted_at: parseDate(tweet.createdAt),
    likes: tweet.likeCount || 0,
    retweets: tweet.retweetCount || 0,
    replies: tweet.replyCount || 0,
    is_retweet: tweet.text?.startsWith('RT @') || false,
    is_reply: !!tweet.inReplyToStatusId,
    is_quote_tweet: !!tweet.quotedTweet,
    quoted_tweet_content: tweet.quotedTweet?.text || null,
    thread_id: tweet.conversationId?.toString() || null,
    thread_position: tweet.conversationId ? index : null,
    raw_data: tweet as Record<string, unknown>,
  }));
}

function parseDate(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
