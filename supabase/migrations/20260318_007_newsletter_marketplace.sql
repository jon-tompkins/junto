-- Migration 007: Newsletter Marketplace
-- Transforms Junto from per-user newsletters to a multi-tenant newsletter marketplace

-- ============================================================
-- SOURCES: Abstracted content sources (Twitter, YouTube, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'twitter',  -- twitter, youtube, etc.
  handle_or_url TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(type, handle_or_url)
);

CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_handle ON sources(handle_or_url);
CREATE INDEX idx_sources_active ON sources(is_active) WHERE is_active = true;

-- ============================================================
-- CONTENT_TWITTER: Tweets pulled from Twitter sources
-- ============================================================
CREATE TABLE IF NOT EXISTS content_twitter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  twitter_id TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  is_retweet BOOLEAN DEFAULT false,
  is_reply BOOLEAN DEFAULT false,
  thread_id TEXT,
  raw_data JSONB DEFAULT '{}',
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_twitter_source ON content_twitter(source_id);
CREATE INDEX idx_content_twitter_posted ON content_twitter(posted_at DESC);
CREATE INDEX idx_content_twitter_source_posted ON content_twitter(source_id, posted_at DESC);

-- ============================================================
-- NEWSLETTERS_V2: First-class newsletter entities
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletters_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  secondary_prompt TEXT,  -- free-form (watchlists, keywords, special instructions)
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT true,
  schedule_cadence TEXT NOT NULL DEFAULT 'daily',  -- daily, twice_daily, weekly
  credit_cost INTEGER NOT NULL DEFAULT 1,
  subscriber_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_newsletters_v2_admin ON newsletters_v2(admin_user_id);
CREATE INDEX idx_newsletters_v2_public ON newsletters_v2(is_public) WHERE is_public = true;
CREATE INDEX idx_newsletters_v2_cadence ON newsletters_v2(schedule_cadence);

-- ============================================================
-- NEWSLETTER_LABELS: Tags for discovery/search
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES newsletters_v2(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  UNIQUE(newsletter_id, label)
);

CREATE INDEX idx_newsletter_labels_label ON newsletter_labels(label);
CREATE INDEX idx_newsletter_labels_newsletter ON newsletter_labels(newsletter_id);

-- ============================================================
-- NEWSLETTER_SOURCES: Links newsletters to their content sources
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES newsletters_v2(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  UNIQUE(newsletter_id, source_id)
);

CREATE INDEX idx_newsletter_sources_newsletter ON newsletter_sources(newsletter_id);
CREATE INDEX idx_newsletter_sources_source ON newsletter_sources(source_id);

-- ============================================================
-- SUBSCRIPTIONS: Users subscribing to newsletters
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  newsletter_id UUID NOT NULL REFERENCES newsletters_v2(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, newsletter_id)
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_newsletter ON subscriptions(newsletter_id);
CREATE INDEX idx_subscriptions_active ON subscriptions(is_active) WHERE is_active = true;

-- ============================================================
-- NEWSLETTER_RUNS: Each generation of a newsletter
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES newsletters_v2(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  subject TEXT,
  model_used TEXT,
  tokens_used JSONB DEFAULT '{}',  -- {input_tokens, output_tokens}
  metadata JSONB DEFAULT '{}',      -- source counts, content window, etc.
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_newsletter_runs_newsletter ON newsletter_runs(newsletter_id);
CREATE INDEX idx_newsletter_runs_generated ON newsletter_runs(generated_at DESC);
CREATE INDEX idx_newsletter_runs_newsletter_generated ON newsletter_runs(newsletter_id, generated_at DESC);

-- ============================================================
-- NEWSLETTER_DELIVERIES: Track who received what
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES newsletter_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  delivery_method TEXT DEFAULT 'email'  -- email, in_app, etc.
);

CREATE INDEX idx_newsletter_deliveries_run ON newsletter_deliveries(run_id);
CREATE INDEX idx_newsletter_deliveries_user ON newsletter_deliveries(user_id);
CREATE INDEX idx_newsletter_deliveries_user_delivered ON newsletter_deliveries(user_id, delivered_at DESC);

-- ============================================================
-- CREDIT_TRANSACTIONS: Ledger for credits
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,  -- positive = credit, negative = debit
  type TEXT NOT NULL,        -- 'subscription_charge', 'creator_earning', 'purchase', 'bonus'
  newsletter_id UUID REFERENCES newsletters_v2(id) ON DELETE SET NULL,
  run_id UUID REFERENCES newsletter_runs(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX idx_credit_transactions_user_created ON credit_transactions(user_id, created_at DESC);

-- ============================================================
-- USER TABLE UPDATES: Add fields for marketplace
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'twitter';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance INTEGER DEFAULT 100;

-- ============================================================
-- HELPER FUNCTION: Update subscriber_count on newsletters_v2
-- ============================================================
CREATE OR REPLACE FUNCTION update_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE newsletters_v2
    SET subscriber_count = (
      SELECT COUNT(*) FROM subscriptions
      WHERE newsletter_id = NEW.newsletter_id AND is_active = true
    )
    WHERE id = NEW.newsletter_id;
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.newsletter_id != NEW.newsletter_id) THEN
    UPDATE newsletters_v2
    SET subscriber_count = (
      SELECT COUNT(*) FROM subscriptions
      WHERE newsletter_id = OLD.newsletter_id AND is_active = true
    )
    WHERE id = OLD.newsletter_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_subscriber_count
AFTER INSERT OR UPDATE OR DELETE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION update_subscriber_count();
