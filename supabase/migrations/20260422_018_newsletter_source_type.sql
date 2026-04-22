-- Migration 018: Newsletter Source Type
-- Adds 'newsletter' as a valid source type and creates content_newsletter table
-- to bridge the existing newsletter_content ingestion pipeline into the v2 sources pipeline.

-- ============================================================
-- Add newsletter to source type check constraint
-- (Supabase uses check constraints not enums for this)
-- ============================================================
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_type_check
  CHECK (type IN ('twitter', 'youtube', 'rss', 'newsletter'));

-- ============================================================
-- CONTENT_NEWSLETTER: mirrors newsletter_content but keyed by source_id
-- so it fits the v2 content pipeline
-- ============================================================
CREATE TABLE IF NOT EXISTS content_newsletter (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  newsletter_content_id UUID NOT NULL REFERENCES newsletter_content(id) ON DELETE CASCADE,
  subject TEXT,
  content TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, newsletter_content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_newsletter_source ON content_newsletter(source_id);
CREATE INDEX IF NOT EXISTS idx_content_newsletter_received ON content_newsletter(received_at DESC);

-- ============================================================
-- NEWSLETTER_REQUESTS: users can request new newsletters be added
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_requests_user ON newsletter_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_requests_status ON newsletter_requests(status);
