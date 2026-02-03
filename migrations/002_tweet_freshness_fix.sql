-- =============================================================================
-- MyJunto Tweet Freshness Fix - Complete Migration
-- =============================================================================
-- This migration adds all missing tables and columns needed for tweet ingestion.
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/lsqlqssigerzghlxfxjl/sql/new
-- =============================================================================

-- 1. PROFILES TABLE - Twitter accounts being tracked
-- =============================================================================
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

CREATE INDEX IF NOT EXISTS idx_profiles_twitter_handle ON profiles(twitter_handle);
CREATE INDEX IF NOT EXISTS idx_profiles_last_fetched ON profiles(last_fetched_at);

-- 2. TWEETS TABLE - Stored tweets from tracked profiles
-- =============================================================================
CREATE TABLE IF NOT EXISTS tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_id TEXT UNIQUE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  
  -- Engagement metrics
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

CREATE INDEX IF NOT EXISTS idx_tweets_profile_posted ON tweets(profile_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_posted_at ON tweets(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_thread ON tweets(thread_id, thread_position);
CREATE INDEX IF NOT EXISTS idx_tweets_twitter_id ON tweets(twitter_id);
CREATE INDEX IF NOT EXISTS idx_tweets_fetched_at ON tweets(fetched_at DESC);

-- 3. USER_PROFILES TABLE - Links users to profiles they follow
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_profile_id ON user_profiles(profile_id);

-- 4. ADD MISSING COLUMNS TO USERS TABLE
-- =============================================================================
DO $$
BEGIN
  -- Add twitter_handle column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'twitter_handle') THEN
    ALTER TABLE users ADD COLUMN twitter_handle TEXT;
    CREATE INDEX IF NOT EXISTS idx_users_twitter_handle ON users(twitter_handle);
  END IF;
  
  -- Add has_access column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'has_access') THEN
    ALTER TABLE users ADD COLUMN has_access BOOLEAN DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_users_has_access ON users(has_access);
  END IF;
END $$;

-- 5. UPDATE NEWSLETTERS TABLE TO MATCH CODE EXPECTATIONS
-- =============================================================================
-- Add missing columns to newsletters table
DO $$
BEGIN
  -- Add subject column (map from title)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'subject') THEN
    ALTER TABLE newsletters ADD COLUMN subject TEXT;
  END IF;
  
  -- Add user_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'user_id') THEN
    ALTER TABLE newsletters ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  
  -- Add tweet tracking columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'tweet_ids') THEN
    ALTER TABLE newsletters ADD COLUMN tweet_ids UUID[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'tweet_count') THEN
    ALTER TABLE newsletters ADD COLUMN tweet_count INTEGER DEFAULT 0;
  END IF;
  
  -- Add date range columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'date_range_start') THEN
    ALTER TABLE newsletters ADD COLUMN date_range_start TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'date_range_end') THEN
    ALTER TABLE newsletters ADD COLUMN date_range_end TIMESTAMPTZ;
  END IF;
  
  -- Add AI metadata columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'model_used') THEN
    ALTER TABLE newsletters ADD COLUMN model_used TEXT DEFAULT 'claude-sonnet-4-20250514';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'prompt_version') THEN
    ALTER TABLE newsletters ADD COLUMN prompt_version TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'input_tokens') THEN
    ALTER TABLE newsletters ADD COLUMN input_tokens INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'output_tokens') THEN
    ALTER TABLE newsletters ADD COLUMN output_tokens INTEGER;
  END IF;
  
  -- Add delivery tracking columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'sent_at') THEN
    ALTER TABLE newsletters ADD COLUMN sent_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'sent_to') THEN
    ALTER TABLE newsletters ADD COLUMN sent_to TEXT[] DEFAULT '{}';
  END IF;
  
  -- Add metadata column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'metadata') THEN
    ALTER TABLE newsletters ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add generated_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'newsletters' AND column_name = 'generated_at') THEN
    ALTER TABLE newsletters ADD COLUMN generated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Update subject from title for existing rows
UPDATE newsletters SET subject = title WHERE subject IS NULL AND title IS NOT NULL;

-- 6. SEED INITIAL PROFILES
-- =============================================================================
INSERT INTO profiles (twitter_handle) VALUES 
  ('crypto_condom'),
  ('cburniske'),
  ('krugman87')
ON CONFLICT (twitter_handle) DO NOTHING;

-- 7. SET UP JON'S USER FOR TESTING
-- =============================================================================
-- Update Jon's user with required fields
UPDATE users 
SET 
  has_access = TRUE,
  twitter_handle = 'jontoshav'
WHERE email = 'jonto2121@gmail.com';

-- Link Jon to the seeded profiles
INSERT INTO user_profiles (user_id, profile_id)
SELECT 
  (SELECT id FROM users WHERE email = 'jonto2121@gmail.com'),
  id
FROM profiles
WHERE twitter_handle IN ('crypto_condom', 'cburniske', 'krugman87')
ON CONFLICT (user_id, profile_id) DO NOTHING;

-- 8. ENABLE RLS POLICIES
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (can tighten later)
DROP POLICY IF EXISTS "Allow all on profiles" ON profiles;
CREATE POLICY "Allow all on profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on tweets" ON tweets;
CREATE POLICY "Allow all on tweets" ON tweets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on user_profiles" ON user_profiles;
CREATE POLICY "Allow all on user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON profiles TO anon, authenticated;
GRANT ALL ON tweets TO anon, authenticated;
GRANT ALL ON user_profiles TO anon, authenticated;

-- 9. VERIFICATION QUERIES
-- =============================================================================
-- Show all profiles
SELECT 'Profiles Created:' as status;
SELECT id, twitter_handle, last_fetched_at FROM profiles;

-- Show users with access
SELECT 'Users with Access:' as status;
SELECT id, email, twitter_handle, has_access FROM users WHERE has_access = TRUE;

-- Show user-profile mappings
SELECT 'User-Profile Mappings:' as status;
SELECT 
  u.email,
  p.twitter_handle
FROM user_profiles up
JOIN users u ON u.id = up.user_id
JOIN profiles p ON p.id = up.profile_id;

-- Done!
SELECT '✅ Tweet Freshness Fix Migration Complete!' as status;
SELECT 'Next: Ensure TWITTER_PROXY_URL and TWITTER_PROXY_TOKEN are configured in Vercel environment variables.' as next_step;
