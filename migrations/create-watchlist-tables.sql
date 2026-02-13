-- Create watchlist tables
-- Run in Supabase SQL Editor

-- User watchlist (tickers users want to track)
CREATE TABLE IF NOT EXISTS user_watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_ticker ON user_watchlist(ticker);

-- Watchlist tweets (scraped tweets about watched tickers)
CREATE TABLE IF NOT EXISTS watchlist_tweets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  tweet_id VARCHAR(50) NOT NULL UNIQUE,
  author_handle VARCHAR(100) NOT NULL,
  author_name VARCHAR(200),
  author_followers INTEGER DEFAULT 0,
  content TEXT NOT NULL,
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  quality_score INTEGER DEFAULT 0,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for watchlist_tweets
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_ticker ON watchlist_tweets(ticker);
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_posted_at ON watchlist_tweets(posted_at);
CREATE INDEX IF NOT EXISTS idx_watchlist_tweets_quality ON watchlist_tweets(quality_score DESC);

-- Now seed the initial tickers
INSERT INTO user_watchlist (user_id, ticker) VALUES
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'BEP'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'APTV'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'AES'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'XPRO'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'CVNA'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'OXY')
ON CONFLICT (user_id, ticker) DO NOTHING;
