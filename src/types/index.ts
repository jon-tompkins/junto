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

// ============================================================
// V2 Marketplace Types
// ============================================================

export type SourceType = 'twitter' | 'youtube' | 'rss' | 'newsletter';
export type ScheduleCadence = 'daily' | 'twice_daily' | 'weekly';
export type CreditTransactionType = 'subscription_charge' | 'creator_earning' | 'purchase' | 'bonus';

export interface Source {
  id: string;
  type: SourceType;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentTwitter {
  id: string;
  source_id: string;
  twitter_id: string;
  content: string;
  posted_at: string;
  likes: number;
  retweets: number;
  replies: number;
  is_retweet: boolean;
  is_reply: boolean;
  thread_id: string | null;
  raw_data: Record<string, unknown>;
  fetched_at: string;
}

export interface ContentNewsletter {
  id: string;
  source_id: string;
  newsletter_content_id: string;
  subject: string | null;
  content: string;
  received_at: string;
  fetched_at: string;
}

export interface NewsletterV2 {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  secondary_prompt: string | null;
  admin_user_id: string;
  is_public: boolean;
  schedule_cadence: ScheduleCadence;
  credit_cost: number;
  subscriber_count: number;
  created_at: string;
  updated_at: string;
  prompt_template_id?: string | null;
  send_days?: string[];
  keywords?: string[];
  junto_id?: string | null;
  watchlist_id?: string | null;
}

export interface NewsletterLabel {
  id: string;
  newsletter_id: string;
  label: string;
}

export interface NewsletterSource {
  id: string;
  newsletter_id: string;
  source_id: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  newsletter_id: string;
  is_active: boolean;
  delivery_email?: string | null;
  delivery_channel?: 'email' | 'telegram' | 'both';
  send_windows?: string[];
  receive_windows?: string[];
  receive_days?: string[];
  created_at: string;
}

export type NewsletterRunStatus =
  | 'delivered'
  | 'partial_delivered'
  | 'generated'
  | 'generated_not_delivered'
  | 'skipped'
  | 'error';

export interface NewsletterRun {
  id: string;
  newsletter_id: string;
  content: string | null;
  subject: string | null;
  model_used: string | null;
  tokens_used: { input_tokens?: number; output_tokens?: number };
  metadata: Record<string, unknown>;
  generated_at: string;
  status: NewsletterRunStatus;
  error_message: string | null;
}

export interface NewsletterDelivery {
  id: string;
  run_id: string;
  user_id: string;
  delivered_at: string;
  delivery_method: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: CreditTransactionType;
  newsletter_id: string | null;
  run_id: string | null;
  description: string | null;
  created_at: string;
}

// Extended types with joins
export interface NewsletterV2WithSources extends NewsletterV2 {
  sources: Source[];
  labels: string[];
}

export interface NewsletterV2WithAdmin extends NewsletterV2 {
  admin: { display_name: string | null; avatar_url: string | null };
}

export interface NewsletterRunWithNewsletter extends NewsletterRun {
  newsletter: Pick<NewsletterV2, 'id' | 'name'>;
}
