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

interface BirdTweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  author?: {
    username: string;
    name: string;
  };
  conversationId?: string;
  inReplyToStatusId?: string;
  quotedTweet?: {
    text: string;
  };
}

interface ProxyResponse {
  success: boolean;
  handle: string;
  count: number;
  tweets: BirdTweet[];
  error?: string;
}

export async function fetchTweetsForProfile(
  handle: string,
  maxTweets = 30
): Promise<FetchedTweet[]> {
  const cleanHandle = handle.replace('@', '');
  console.log(`Fetching tweets for @${cleanHandle} via proxy...`);
  
  const proxyUrl = process.env.TWITTER_PROXY_URL;
  const proxyToken = process.env.TWITTER_PROXY_TOKEN;
  
  if (!proxyUrl || !proxyToken) {
    throw new Error('TWITTER_PROXY_URL and TWITTER_PROXY_TOKEN must be configured');
  }
  
  try {
    const response = await fetch(
      `${proxyUrl}/tweets?handle=${cleanHandle}&count=${maxTweets}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${proxyToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Proxy error: ${response.status} - ${error}`);
    }
    
    const data: ProxyResponse = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown proxy error');
    }
    
    console.log(`Fetched ${data.tweets.length} tweets for @${cleanHandle}`);
    
    // Transform to our format
    return data.tweets.map((tweet, index) => {
      const isRetweet = tweet.text?.startsWith('RT @') || false;
      const isReply = !!tweet.inReplyToStatusId;
      const isQuote = !!tweet.quotedTweet;
      
      return {
        twitter_id: tweet.id,
        content: tweet.text || '',
        posted_at: parseDate(tweet.createdAt),
        likes: tweet.likeCount || 0,
        retweets: tweet.retweetCount || 0,
        replies: tweet.replyCount || 0,
        is_retweet: isRetweet,
        is_reply: isReply,
        is_quote_tweet: isQuote,
        quoted_tweet_content: tweet.quotedTweet?.text || null,
        thread_id: tweet.conversationId || null,
        thread_position: tweet.conversationId ? index : null,
        raw_data: tweet as unknown as Record<string, unknown>,
      };
    });
    
  } catch (error) {
    console.error(`Error fetching tweets for @${cleanHandle}:`, error);
    throw error;
  }
}

function parseDate(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
