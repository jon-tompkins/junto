-- MyJunto Tweet Tables Migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/lsqlqssigerzghlxfxjl/sql/new
-- This creates the missing tables required for tweet fetching and newsletter generation

-- 1. Profiles table: Twitter accounts we're tracking
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_handle TEXT UNIQUE NOT NULL,
  twitter_id TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_fetched_at TIMESTAMPTZ,
  fetch_config JSONB DEFAULT '{}'
);

-- Index for fast profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_twitter_handle ON profiles(twitter_handle);

-- 2. Tweets table: Individual tweets from tracked profiles
CREATE TABLE IF NOT EXISTS tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_id TEXT UNIQUE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  
  -- Engagement metrics for filtering
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  
  -- Tweet metadata
  is_retweet BOOLEAN DEFAULT FALSE,
  is_reply BOOLEAN DEFAULT FALSE,
  is_quote_tweet BOOLEAN DEFAULT FALSE,
  quoted_tweet_content TEXT,
  
  -- Thread handling
  thread_id TEXT,
  thread_position INTEGER,
  
  -- Processing metadata
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tweets_profile_posted ON tweets(profile_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_posted_at ON tweets(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_thread ON tweets(thread_id, thread_position);
CREATE INDEX IF NOT EXISTS idx_tweets_twitter_id ON tweets(twitter_id);

-- 3. User-Profile junction table: which users follow which profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, profile_id)
);

-- Index for quick user profile lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_profile_id ON user_profiles(profile_id);

-- 4. Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_handle TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_access BOOLEAN DEFAULT FALSE;

-- Create index on twitter_handle for the users table
CREATE INDEX IF NOT EXISTS idx_users_twitter_handle ON users(twitter_handle);
CREATE INDEX IF NOT EXISTS idx_users_has_access ON users(has_access);

-- 5. Seed some initial profiles (can customize these)
INSERT INTO profiles (twitter_handle) VALUES 
  ('crypto_condom'),
  ('cburniske'),
  ('krugman87')
ON CONFLICT (twitter_handle) DO NOTHING;

-- Done! Now redeploy and test the tweet fetching endpoint.
