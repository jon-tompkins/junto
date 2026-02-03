-- =============================================================================
-- MyJunto User Columns Fix
-- =============================================================================
-- This migration adds missing columns and constraints needed for user auth.
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/lsqlqssigerzghlxfxjl/sql/new
-- =============================================================================

-- 1. ADD MISSING COLUMNS TO USERS TABLE
-- =============================================================================
DO $$
BEGIN
  -- Add twitter_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'twitter_id') THEN
    ALTER TABLE users ADD COLUMN twitter_id TEXT;
  END IF;
  
  -- Add display_name column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'display_name') THEN
    ALTER TABLE users ADD COLUMN display_name TEXT;
  END IF;
  
  -- Add avatar_url column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'avatar_url') THEN
    ALTER TABLE users ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- 2. CREATE UNIQUE CONSTRAINT FOR TWITTER_ID (needed for upsert)
-- =============================================================================
-- Drop any existing constraint first (safe if doesn't exist)
DO $$
BEGIN
  -- Create unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_twitter_id_key' 
    AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_twitter_id_key UNIQUE (twitter_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Constraint already exists, ignore
END $$;

-- 3. CREATE INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_twitter_id ON users(twitter_id);

-- 4. UPDATE EXISTING USERS
-- =============================================================================
-- For Jon's user, ensure all fields are set
UPDATE users 
SET 
  twitter_handle = 'jontoshav',
  has_access = TRUE
WHERE email = 'jonto2121@gmail.com'
AND (twitter_handle IS NULL OR twitter_handle != 'jontoshav');

-- Sync twitter_handle from name for any users that have name but not twitter_handle
UPDATE users
SET twitter_handle = name
WHERE twitter_handle IS NULL 
AND name IS NOT NULL 
AND name != '';

-- 5. VERIFICATION
-- =============================================================================
SELECT 'Users table columns:' as status;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

SELECT 'Users with twitter_handle set:' as status;
SELECT id, email, name, twitter_handle, twitter_id, has_access FROM users;

SELECT '✅ User Columns Fix Migration Complete!' as status;
