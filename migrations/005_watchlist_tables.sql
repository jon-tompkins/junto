-- MyJunto Watchlist Tables Migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/lsqlqssigerzghlxfxjl/sql/new
-- This creates the watchlist functionality for tracking specific tickers

-- 1. User watchlist table: stores which tickers each user is watching
CREATE TABLE IF NOT EXISTS user_watchlist (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

-- Index for fast ticker lookups
CREATE INDEX IF NOT EXISTS idx_user_watchlist_ticker ON user_watchlist(ticker);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON user_watchlist(user_id);

-- 2. Watchlist tweets table: stores quality tweets about watchlist tickers
CREATE TABLE IF NOT EXISTS watchlist_tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  tweet_id TEXT UNIQUE NOT NULL,
  author_handle TEXT NOT NULL,
  author_name TEXT,
  author_followers INTEGER DEFAULT 0,
  content TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  quality_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Additional metadata
  raw_data JSONB
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_ticker ON watchlist_tweets(ticker);
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_posted_at ON watchlist_tweets(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_quality_score ON watchlist_tweets(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_tweet_id ON watchlist_tweets(tweet_id);

-- Combined index for fetching top tweets by ticker
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_ticker_quality ON watchlist_tweets(ticker, quality_score DESC, posted_at DESC);

-- Seed initial watchlist for jonto21 (if user exists)
DO $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Find the user by twitter_handle
    SELECT id INTO user_uuid FROM users WHERE twitter_handle = 'jonto21' LIMIT 1;
    
    IF user_uuid IS NOT NULL THEN
        -- Add initial watchlist tickers
        INSERT INTO user_watchlist (user_id, ticker) VALUES 
            (user_uuid, 'OXY'),
            (user_uuid, 'AES'),
            (user_uuid, 'XPRO'),
            (user_uuid, 'BEP')
        ON CONFLICT (user_id, ticker) DO NOTHING;
        
        RAISE NOTICE 'Seeded watchlist for user: %', user_uuid;
    ELSE
        RAISE NOTICE 'User with twitter_handle jonto21 not found - skipping watchlist seed';
    END IF;
END $$;

-- Done! Now you can add watchlist functionality to the app.