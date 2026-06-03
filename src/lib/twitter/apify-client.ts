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

import { recordCost, apifyCostCents } from '../costs';

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
  maxTweets = 30,
  sinceDate?: string // ISO date string — minute-precision via Twitter's since_time operator
): Promise<FetchedTweet[]> {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    throw new Error('APIFY_API_KEY not configured');
  }

  const cleanHandle = handle.replace('@', '');

  // Twitter search's `since_time:<unix>` (seconds) gives minute-level precision,
  // unlike `since:YYYY-MM-DD` which returns everything from 00:00 UTC that day
  // and causes same-day duplicate fetches.
  let searchQuery = `from:${cleanHandle}`;
  if (sinceDate) {
    const sinceUnix = Math.floor(new Date(sinceDate).getTime() / 1000);
    searchQuery += ` since_time:${sinceUnix}`;
    console.log(`[Apify] Fetching NEW tweets for @${cleanHandle} since ${sinceDate} (unix ${sinceUnix})...`);
  } else {
    console.log(`[Apify] Fetching tweets for @${cleanHandle} (no date filter)...`);
  }

  // Start the run
  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchTerms: [searchQuery],
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

  recordCost({
    supplier: 'apify',
    operation: 'tweet_pull_single',
    cost_cents: apifyCostCents(tweets.length),
    usage_amount: tweets.length,
    usage_unit: 'tweets',
    external_id: runId,
    metadata: { handle: cleanHandle, actor: APIFY_ACTOR_ID },
  });

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

/**
 * Start a batched Apify run for many handles in one go and return the run_id
 * immediately. Does NOT poll for completion — pair with `collectBatchResults`
 * via a separate cron so we don't burn Vercel function time waiting on Apify.
 */
export async function startBatchRun(
  handles: string[],
  maxTweetsPerHandle = 30,
  sinceDate?: string,
): Promise<{ runId: string; cleanHandles: string[] }> {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    throw new Error('APIFY_API_KEY not configured');
  }
  if (handles.length === 0) {
    throw new Error('startBatchRun called with no handles');
  }

  const cleanHandles = handles.map((h) => h.replace('@', ''));
  const sinceUnix = sinceDate ? Math.floor(new Date(sinceDate).getTime() / 1000) : null;
  const searchTerms = cleanHandles.map((h) =>
    sinceUnix ? `from:${h} since_time:${sinceUnix}` : `from:${h}`,
  );

  const totalDesired = handles.length * maxTweetsPerHandle;

  console.log(
    `[Apify BATCH] Starting async run for ${handles.length} handles${sinceDate ? ` since ${sinceDate}` : ''} (up to ${totalDesired} tweets)...`,
  );

  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchTerms,
        tweetsDesired: totalDesired,
      }),
    },
  );

  const runData = await runRes.json();
  const runId = runData.data?.id;

  if (!runId) {
    throw new Error('Failed to start Apify run');
  }

  console.log(`[Apify BATCH] Run started: ${runId} (will be collected later)`);
  return { runId, cleanHandles };
}

export type CollectResult =
  | { status: 'pending' }
  | { status: 'failed'; reason: string }
  | {
      status: 'completed';
      tweetCount: number;
      tweetsByHandle: Record<string, FetchedTweet[]>;
    };

/**
 * Check status of a previously-started Apify run. If SUCCEEDED, fetch results
 * and group them by the originally-requested handles. Records cost on success.
 */
export async function collectBatchResults(
  runId: string,
  handles: string[],
): Promise<CollectResult> {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    throw new Error('APIFY_API_KEY not configured');
  }

  const statusRes = await fetch(
    `${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`,
  );
  const statusData = await statusRes.json();
  const status = statusData.data?.status;

  if (!status) {
    return { status: 'failed', reason: 'Apify status response missing data.status' };
  }

  // Apify run statuses: READY, RUNNING, SUCCEEDED, FAILED, ABORTING, ABORTED,
  // TIMING-OUT, TIMED-OUT
  if (status === 'READY' || status === 'RUNNING') {
    return { status: 'pending' };
  }
  if (status !== 'SUCCEEDED') {
    return { status: 'failed', reason: `Apify run ${status}` };
  }

  const resultsRes = await fetch(
    `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items?token=${token}`,
  );
  const rawResults = await resultsRes.json();
  const tweets = (Array.isArray(rawResults) ? rawResults : []).filter(
    (r: any) => r.type !== 'mock_tweet',
  );

  console.log(
    `[Apify BATCH] Collected ${tweets.length} tweets for run ${runId} across ${handles.length} handles`,
  );

  recordCost({
    supplier: 'apify',
    operation: 'tweet_pull_batched',
    cost_cents: apifyCostCents(tweets.length),
    usage_amount: tweets.length,
    usage_unit: 'tweets',
    external_id: runId,
    metadata: { handles: handles.length, actor: APIFY_ACTOR_ID },
  });

  const cleanHandles = handles.map((h) => h.replace('@', ''));
  const byHandle: Record<string, FetchedTweet[]> = {};
  for (const h of cleanHandles) {
    byHandle[h.toLowerCase()] = [];
  }

  for (const tweet of tweets) {
    const author = (tweet.author?.userName || '').toLowerCase();
    if (!author) continue;
    if (!byHandle[author]) continue; // Skip tweets from authors we didn't ask for

    const index = byHandle[author].length;
    const isRetweet = tweet.text?.startsWith('RT @') || false;
    const isReply = !!tweet.inReplyToStatusId;
    const isQuote = !!tweet.quotedTweet;

    byHandle[author].push({
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
    });
  }

  // Return keyed by original handle casing (so callers can round-trip)
  const keyed: Record<string, FetchedTweet[]> = {};
  for (const h of handles) {
    const clean = h.replace('@', '').toLowerCase();
    keyed[h] = byHandle[clean] || [];
  }

  return { status: 'completed', tweetCount: tweets.length, tweetsByHandle: keyed };
}

/**
 * Synchronous one-shot batch fetch — kept for callers (e.g. validation, ad-hoc
 * tools) that genuinely need to wait inline. The cron pull pipeline now uses
 * the async startBatchRun + collectBatchResults pair instead.
 */
export async function fetchTweetsForMultipleProfiles(
  handles: string[],
  maxTweetsPerHandle = 30,
  sinceDate?: string,
): Promise<Record<string, FetchedTweet[]>> {
  if (handles.length === 0) return {};
  const { runId } = await startBatchRun(handles, maxTweetsPerHandle, sinceDate);

  const startTime = Date.now();
  const maxWaitMs = 120000;
  while (Date.now() - startTime < maxWaitMs) {
    const result = await collectBatchResults(runId, handles);
    if (result.status === 'completed') return result.tweetsByHandle;
    if (result.status === 'failed') {
      throw new Error(`Apify batch failed: ${result.reason}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Apify batch timed out');
}

export async function searchTweets(
  query: string,
  maxTweets = 30,
  sinceDate?: string,
): Promise<FetchedTweet[]> {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    throw new Error('APIFY_API_KEY not configured');
  }

  let searchQuery = query;
  if (sinceDate) {
    const sinceUnix = Math.floor(new Date(sinceDate).getTime() / 1000);
    searchQuery = `${query} since_time:${sinceUnix}`;
  }

  console.log(`[Apify] Searching for "${searchQuery}"...`);

  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchTerms: [searchQuery],
        tweetsDesired: maxTweets,
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

  recordCost({
    supplier: 'apify',
    operation: 'tweet_search',
    cost_cents: apifyCostCents(tweets.length),
    usage_amount: tweets.length,
    usage_unit: 'tweets',
    external_id: runId,
    metadata: { query, actor: APIFY_ACTOR_ID },
  });

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
// Trigger redeploy 1771525438
