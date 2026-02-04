-- =============================================================================
-- MyJunto Newsletter Ingestion - Database Migration
-- =============================================================================
-- Adds tables to support ingesting 3rd party newsletters via email.
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/lsqlqssigerzghlxfxjl/sql/new
-- =============================================================================

-- 1. AVAILABLE NEWSLETTERS TABLE
-- Stores newsletters that Jon manages and makes available to users
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.available_newsletters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sender_email TEXT,  -- Email address the newsletter comes from
  sender_patterns TEXT[],  -- Additional patterns to match sender (e.g., 'bitwise', 'castleisland')
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_available_newsletters_slug ON public.available_newsletters(slug);
CREATE INDEX IF NOT EXISTS idx_available_newsletters_active ON public.available_newsletters(is_active);

-- 2. USER NEWSLETTERS TABLE
-- Links users to their selected newsletters (up to 5 per user)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_newsletters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  newsletter_id UUID NOT NULL REFERENCES public.available_newsletters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, newsletter_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_newsletters_user ON public.user_newsletters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_newsletters_newsletter ON public.user_newsletters(newsletter_id);

-- 3. NEWSLETTER CONTENT TABLE
-- Stores ingested newsletter content from emails
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.newsletter_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES public.available_newsletters(id) ON DELETE CASCADE,
  subject TEXT,
  content TEXT NOT NULL,
  content_html TEXT,  -- Original HTML if available
  summary TEXT,  -- AI-generated summary
  sender_email TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  message_id TEXT UNIQUE,  -- Email message ID for deduplication
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_newsletter_content_newsletter ON public.newsletter_content(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_content_received ON public.newsletter_content(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_content_message_id ON public.newsletter_content(message_id);

-- 4. SEED INITIAL NEWSLETTERS
-- Bitwise CIO Memo and Castle Island
-- =============================================================================
INSERT INTO public.available_newsletters (name, slug, description, sender_patterns)
VALUES 
  ('Bitwise CIO Memo', 'bitwise-cio', 'Weekly insights from Bitwise CIO on crypto markets and trends', ARRAY['bitwise', 'bitwiseinvestments']),
  ('Castle Island', 'castle-island', 'Crypto-focused newsletter from Castle Island Ventures', ARRAY['castleisland', 'castle island'])
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sender_patterns = EXCLUDED.sender_patterns,
  updated_at = NOW();

-- 5. ENABLE ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.available_newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_content ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to available_newsletters" ON public.available_newsletters
  FOR ALL USING (true);

CREATE POLICY "Service role has full access to user_newsletters" ON public.user_newsletters
  FOR ALL USING (true);

CREATE POLICY "Service role has full access to newsletter_content" ON public.newsletter_content
  FOR ALL USING (true);

-- 6. VERIFICATION
-- =============================================================================
SELECT '=== AVAILABLE NEWSLETTERS ===' as info;
SELECT id, name, slug, is_active FROM public.available_newsletters;

SELECT '=== TABLE COUNTS ===' as info;
SELECT 
  (SELECT COUNT(*) FROM public.available_newsletters) as available_newsletters,
  (SELECT COUNT(*) FROM public.user_newsletters) as user_newsletters,
  (SELECT COUNT(*) FROM public.newsletter_content) as newsletter_content;

SELECT '✅ Migration 004_newsletter_ingestion.sql completed successfully!' as status;
