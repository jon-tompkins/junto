-- =============================================================================
-- MyJunto User Columns Fix - PRODUCTION SAFE VERSION
-- =============================================================================
-- This migration adds Twitter auth columns to the users table.
-- Completely bulletproof: checks for column existence before ALL operations.
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/lsqlqssigerzghlxfxjl/sql/new
-- =============================================================================

-- 1. ADD ALL MISSING COLUMNS TO USERS TABLE
-- =============================================================================
DO $$
BEGIN
  -- Add twitter_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'twitter_id') THEN
    ALTER TABLE public.users ADD COLUMN twitter_id TEXT;
    RAISE NOTICE 'Added column: twitter_id';
  ELSE
    RAISE NOTICE 'Column already exists: twitter_id';
  END IF;
  
  -- Add twitter_handle column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'twitter_handle') THEN
    ALTER TABLE public.users ADD COLUMN twitter_handle TEXT;
    RAISE NOTICE 'Added column: twitter_handle';
  ELSE
    RAISE NOTICE 'Column already exists: twitter_handle';
  END IF;
  
  -- Add display_name column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'display_name') THEN
    ALTER TABLE public.users ADD COLUMN display_name TEXT;
    RAISE NOTICE 'Added column: display_name';
  ELSE
    RAISE NOTICE 'Column already exists: display_name';
  END IF;
  
  -- Add avatar_url column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_url') THEN
    ALTER TABLE public.users ADD COLUMN avatar_url TEXT;
    RAISE NOTICE 'Added column: avatar_url';
  ELSE
    RAISE NOTICE 'Column already exists: avatar_url';
  END IF;
  
  -- Add has_access column if it doesn't exist (boolean, defaults to false)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'has_access') THEN
    ALTER TABLE public.users ADD COLUMN has_access BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added column: has_access';
  ELSE
    RAISE NOTICE 'Column already exists: has_access';
  END IF;
END $$;

-- 2. CREATE UNIQUE CONSTRAINT FOR TWITTER_ID (needed for upsert)
-- =============================================================================
DO $$
BEGIN
  -- Only create if doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'users_twitter_id_key' 
    AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_twitter_id_key UNIQUE (twitter_id);
    RAISE NOTICE 'Created unique constraint: users_twitter_id_key';
  ELSE
    RAISE NOTICE 'Constraint already exists: users_twitter_id_key';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint users_twitter_id_key already exists (caught exception)';
END $$;

-- 3. CREATE INDEXES (IF NOT EXISTS is built-in and safe)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_twitter_id ON public.users(twitter_id);
CREATE INDEX IF NOT EXISTS idx_users_twitter_handle ON public.users(twitter_handle);

-- 4. UPDATE JON'S USER RECORD
-- =============================================================================
-- This runs AFTER columns are added, so it's safe
UPDATE public.users 
SET 
  twitter_handle = 'jontoshav',
  has_access = TRUE,
  display_name = COALESCE(display_name, name)
WHERE email = 'jonto2121@gmail.com';

-- 5. SYNC twitter_handle FROM name FOR USERS WITHOUT IT
-- =============================================================================
UPDATE public.users
SET twitter_handle = name
WHERE twitter_handle IS NULL 
AND name IS NOT NULL 
AND name != '';

-- 6. VERIFICATION - Show Current State
-- =============================================================================
SELECT '=== USERS TABLE COLUMNS ===' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users' 
ORDER BY ordinal_position;

SELECT '=== USERS DATA ===' as info;
SELECT id, email, name, twitter_handle, twitter_id, display_name, has_access 
FROM public.users;

SELECT '=== CONSTRAINTS ===' as info;
SELECT conname, contype 
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE conrelid = 'public.users'::regclass;

SELECT '✅ Migration 003_fix_user_columns.sql completed successfully!' as status;
