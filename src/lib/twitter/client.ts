import { config } from '@/lib/utils/config';

const RAPIDAPI_HOST = 'twitter154.p.rapidapi.com';

interface TwitterUser {
  user_id: string;
  username: string;
  name: string;
  profile_pic_url?: string;
  description?: string;
}

interface Tweet154Result {
  tweet_id: string;
  text: string;
  creation_date: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count?: number;
  is_retweet?: boolean;
  is_reply?: boolean;
  is_quote?: boolean;
  quoted_tweet?: {
    text: string;
  };
  in_reply_to_status_id?: string;
  conversation_id?: string;
  user?: TwitterUser;
}

interface UserTweetsResponse {
  results: Tweet154Result[];
  continuation_token?: string;
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

export async function fetchTweetsForProfile(
  handle: string,
  maxTweets = 20
): Promise<FetchedTweet[]> {
  if (!config.apify.apiKey) {
    // Check for RAPIDAPI_KEY instead
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      throw new Error('RAPIDAPI_KEY not configured');
    }
  }
  
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    throw new Error('RAPIDAPI_KEY not configured');
  }
  
  const cleanHandle = handle.replace('@', '');
  console.log(`Fetching tweets for @${cleanHandle} via RapidAPI...`);
  
  // First, we need to get the user ID from username
  const userResponse = await fetch(
    `https://${RAPIDAPI_HOST}/user/details?username=${cleanHandle}`,
    {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': rapidApiKey,
      },
    }
  );
  
  if (!userResponse.ok) {
    const error = await userResponse.text();
    console.error('User lookup error:', error);
    throw new Error(`Failed to find user @${cleanHandle}: ${userResponse.status}`);
  }
  
  const userData = await userResponse.json();
  const userId = userData.user_id;
  
  if (!userId) {
    throw new Error(`Could not find user ID for @${cleanHandle}`);
  }
  
  console.log(`Found user ID: ${userId} for @${cleanHandle}`);
  
  // Now fetch tweets
  const tweetsResponse = await fetch(
    `https://${RAPIDAPI_HOST}/user/tweets?user_id=${userId}&limit=${maxTweets}&include_replies=false&include_pinned=false`,
    {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': rapidApiKey,
      },
    }
  );
  
  if (!tweetsResponse.ok) {
    const error = await tweetsResponse.text();
    console.error('Tweets fetch error:', error);
    throw new Error(`Failed to fetch tweets: ${tweetsResponse.status}`);
  }
  
  const tweetsData: UserTweetsResponse = await tweetsResponse.json();
  const tweets = tweetsData.results || [];
  
  console.log(`Fetched ${tweets.length} tweets for @${cleanHandle}`);
  
  // Transform to our format
  return tweets.map((tweet, index) => ({
    twitter_id: tweet.tweet_id,
    content: tweet.text || '',
    posted_at: parseDate(tweet.creation_date),
    likes: tweet.favorite_count || 0,
    retweets: tweet.retweet_count || 0,
    replies: tweet.reply_count || 0,
    is_retweet: tweet.is_retweet || false,
    is_reply: tweet.is_reply || !!tweet.in_reply_to_status_id,
    is_quote_tweet: tweet.is_quote || false,
    quoted_tweet_content: tweet.quoted_tweet?.text || null,
    thread_id: tweet.conversation_id || null,
    thread_position: tweet.conversation_id ? index : null,
    raw_data: tweet as unknown as Record<string, unknown>,
  }));
}

function parseDate(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    // The API returns dates like "Wed Oct 30 14:23:45 +0000 2024"
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
