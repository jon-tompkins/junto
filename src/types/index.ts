// Database types

export interface Profile {
  id: string;
  twitter_handle: string;
  twitter_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  last_fetched_at: string | null;
  fetch_config: {
    min_engagement?: number;
    include_replies?: boolean;
    include_retweets?: boolean;
  };
}

export interface Tweet {
  id: string;
  twitter_id: string;
  profile_id: string;
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
  fetched_at: string;
  raw_data: Record<string, unknown> | null;
}

export interface Newsletter {
  id: string;
  subject: string;
  content: string;
  generated_at: string;
  tweet_ids: string[];
  tweet_count: number;
  date_range_start: string;
  date_range_end: string;
  model_used: string;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  sent_at: string | null;
  sent_to: string[];
  metadata: Record<string, unknown>;
}

// API/Service types

export interface TweetFromAPI {
  id: string;
  text: string;
  created_at: string;
  public_metrics: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
  };
  referenced_tweets?: {
    type: 'quoted' | 'replied_to' | 'retweeted';
    id: string;
    text?: string;
  }[];
  conversation_id?: string;
}

export interface GroupedTweets {
  [handle: string]: {
    twitter_id?: string;
    content: string;
    likes: number;
    retweets: number;
    posted_at: string;
    quoted_tweet_content?: string;
    thread_id?: string;
    thread_position?: number;
  }[];
}

export interface SynthesisResult {
  subject: string;
  content: string;
  input_tokens: number;
  output_tokens: number;
}

export interface NewsletterGenerationResult {
  newsletter: Newsletter;
  sent: boolean;
  error?: string;
}
