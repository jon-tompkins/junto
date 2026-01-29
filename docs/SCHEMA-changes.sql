-- Email Ingestion Feature - Database Schema Changes

-- Create extension for UUID generation if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. User email addresses table
-- Stores unique email addresses for each user to receive newsletters
CREATE TABLE user_email_addresses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_address TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for quick user lookup
CREATE INDEX idx_user_email_addresses_user_id ON user_email_addresses(user_id);
CREATE INDEX idx_user_email_addresses_email ON user_email_addresses(email_address);

-- 2. Ingested emails table
-- Stores all received and parsed email newsletters
CREATE TABLE ingested_emails (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_address_id UUID REFERENCES user_email_addresses(id) ON DELETE CASCADE NOT NULL,
  
  -- Email metadata
  message_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Parsed content
  html_content TEXT,
  text_content TEXT,
  parsed_content TEXT, -- Cleaned main content
  content_length INTEGER,
  
  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')) NOT NULL,
  processing_error TEXT,
  
  -- Newsletter source detection
  source_type TEXT CHECK (source_type IN ('substack', 'morning_brew', 'the_hustle', 'tech_crunch', 'custom')),
  source_domain TEXT,
  
  -- User preferences
  include_in_brief BOOLEAN DEFAULT TRUE,
  priority_score INTEGER DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
  
  -- Metadata
  attachment_count INTEGER DEFAULT 0,
  spam_score REAL CHECK (spam_score >= 0 AND spam_score <= 10),
  is_spam BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Performance indexes
CREATE INDEX idx_ingested_emails_user_id ON ingested_emails(user_id);
CREATE INDEX idx_ingested_emails_received_at ON ingested_emails(received_at DESC);
CREATE INDEX idx_ingested_emails_status ON ingested_emails(status);
CREATE INDEX idx_ingested_emails_include_in_brief ON ingested_emails(include_in_brief) WHERE include_in_brief = TRUE;
CREATE INDEX idx_ingested_emails_source_type ON ingested_emails(source_type);
CREATE INDEX idx_ingested_emails_user_date ON ingested_emails(user_id, received_at DESC);

-- 3. Email attachments table
-- Stores metadata for email attachments
CREATE TABLE email_attachments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ingested_email_id UUID REFERENCES ingested_emails(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL, -- S3 or similar storage path
  content_id TEXT, -- For inline attachments
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_email_attachments_email_id ON email_attachments(ingested_email_id);

-- 4. User watchlist table (extends existing feature)
-- Stores user's key terms to track
CREATE TABLE user_watchlist (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  term TEXT NOT NULL,
  is_high_priority BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, term)
);

CREATE INDEX idx_user_watchlist_user_id ON user_watchlist(user_id);

-- 5. Watchlist matches table
-- Tracks matches of watchlist terms in ingested emails
CREATE TABLE watchlist_matches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ingested_email_id UUID REFERENCES ingested_emails(id) ON DELETE CASCADE NOT NULL,
  term TEXT NOT NULL,
  match_count INTEGER DEFAULT 1 NOT NULL,
  match_contexts JSONB, -- Array of matched contexts with snippets
  is_high_priority BOOLEAN DEFAULT FALSE,
  alerted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, ingested_email_id, term)
);

CREATE INDEX idx_watchlist_matches_user_id ON watchlist_matches(user_id);
CREATE INDEX idx_watchlist_matches_email_id ON watchlist_matches(ingested_email_id);
CREATE INDEX idx_watchlist_matches_high_priority ON watchlist_matches(is_high_priority) WHERE is_high_priority = TRUE;

-- 6. Email processing queue table
-- Queue for async processing of incoming emails
CREATE TABLE email_processing_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ingested_email_id UUID REFERENCES ingested_emails(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')) NOT NULL,
  retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER DEFAULT 3 CHECK (max_retries >= 0),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_email_queue_status ON email_processing_queue(status);
CREATE INDEX idx_email_queue_ingested_email_id ON email_processing_queue(ingested_email_id);
CREATE INDEX idx_email_queue_pending ON email_processing_queue(status, created_at) WHERE status = 'pending';

-- 7. Newsletter sources table (optional normalization)
-- Normalizes common newsletter sources
CREATE TABLE newsletter_sources (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT, -- 'tech', 'business', 'finance', etc.
  is_popular BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Insert some popular newsletter sources
INSERT INTO newsletter_sources (name, domain, description, category, is_popular) VALUES
  ('Substack', 'substack.com', 'Popular newsletter platform', 'general', TRUE),
  ('Morning Brew', 'morningbrew.com', 'Daily business newsletter', 'business', TRUE),
  ('The Hustle', 'thehustle.co', 'Daily tech and business news', 'tech', TRUE),
  ('TechCrunch', 'techcrunch.com', 'Technology news', 'tech', TRUE),
  ('The Information', 'theinformation.com', 'Premium tech news', 'tech', FALSE);

-- 8. User newsletter preferences table
-- Stores user preferences for newsletter handling
CREATE TABLE user_newsletter_preferences (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- General preferences
  auto_include_new_sources BOOLEAN DEFAULT TRUE,
  max_emails_per_day INTEGER DEFAULT 50,
  
  -- Content filtering
  min_content_length INTEGER DEFAULT 100, -- Minimum characters to include
  exclude_short_emails BOOLEAN DEFAULT TRUE,
  
  -- Priority settings
  priority_keywords TEXT[], -- Keywords that boost priority
  excluded_keywords TEXT[], -- Keywords that exclude emails
  
  -- Notification settings
  daily_digest_time TIME, -- Time to send daily digest
  enable_high_priority_alerts BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

CREATE INDEX idx_user_newsletter_prefs_user_id ON user_newsletter_preferences(user_id);

-- 9. Email analytics summary table (for performance)
-- Pre-computed analytics for quick retrieval
CREATE TABLE email_analytics_summary (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  
  -- Counts
  total_emails INTEGER DEFAULT 0,
  processed_emails INTEGER DEFAULT 0,
  failed_emails INTEGER DEFAULT 0,
  
  -- Source breakdown
  sources JSONB, -- { "substack": 5, "morning_brew": 2, ... }
  
  -- Content metrics
  total_content_length INTEGER DEFAULT 0,
  average_content_length INTEGER DEFAULT 0,
  
  -- Watchlist metrics
  total_matches INTEGER DEFAULT 0,
  high_priority_matches INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, date)
);

CREATE INDEX idx_email_analytics_user_date ON email_analytics_summary(user_id, date DESC);

-- Row Level Security (RLS) policies
-- Enable RLS on all tables
ALTER TABLE user_email_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingested_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_newsletter_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_analytics_summary ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own email addresses
CREATE POLICY "Users can view own email addresses" ON user_email_addresses
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own ingested emails
CREATE POLICY "Users can view own ingested emails" ON ingested_emails
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own attachments
CREATE POLICY "Users can view own attachments" ON email_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ingested_emails 
      WHERE ingested_emails.id = email_attachments.ingested_email_id 
      AND ingested_emails.user_id = auth.uid()
    )
  );

-- Users can only manage their own watchlist
CREATE POLICY "Users can manage own watchlist" ON user_watchlist
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own watchlist matches
CREATE POLICY "Users can view own watchlist matches" ON watchlist_matches
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own processing queue
CREATE POLICY "Users can view own processing queue" ON email_processing_queue
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ingested_emails 
      WHERE ingested_emails.id = email_processing_queue.ingested_email_id 
      AND ingested_emails.user_id = auth.uid()
    )
  );

-- Users can only manage their own preferences
CREATE POLICY "Users can manage own preferences" ON user_newsletter_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own analytics
CREATE POLICY "Users can view own analytics" ON email_analytics_summary
  FOR ALL USING (auth.uid() = user_id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_user_email_addresses_updated_at 
  BEFORE UPDATE ON user_email_addresses 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ingested_emails_updated_at 
  BEFORE UPDATE ON ingested_emails 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_watchlist_updated_at 
  BEFORE UPDATE ON user_watchlist 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_processing_queue_updated_at 
  BEFORE UPDATE ON email_processing_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_newsletter_preferences_updated_at 
  BEFORE UPDATE ON user_newsletter_preferences 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_analytics_summary_updated_at 
  BEFORE UPDATE ON email_analytics_summary 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create user email address on signup
CREATE OR REPLACE FUNCTION create_user_email_address()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Generate email address like user123@in.myjunto.xyz
  user_email := 'user' || NEW.id::text || '@in.myjunto.xyz';
  
  INSERT INTO user_email_addresses (user_id, email_address)
  VALUES (NEW.id, user_email);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create email address on user signup
CREATE TRIGGER create_user_email_address_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_email_address();

-- Function to get emails for synthesis
CREATE OR REPLACE FUNCTION get_emails_for_synthesis(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id UUID,
  parsed_content TEXT,
  source_type TEXT,
  priority_score INTEGER,
  received_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ie.id,
    ie.parsed_content,
    ie.source_type,
    ie.priority_score,
    ie.received_at
  FROM ingested_emails ie
  WHERE ie.user_id = p_user_id
    AND ie.status = 'completed'
    AND ie.include_in_brief = TRUE
    AND DATE(ie.received_at) = p_date
  ORDER BY ie.priority_score DESC, ie.received_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update analytics summary
CREATE OR REPLACE FUNCTION update_email_analytics(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO email_analytics_summary (
    user_id,
    date,
    total_emails,
    processed_emails,
    failed_emails,
    sources,
    total_content_length,
    average_content_length,
    total_matches,
    high_priority_matches
  )
  SELECT 
    p_user_id,
    p_date,
    COUNT(*) as total_emails,
    COUNT(*) FILTER (WHERE status = 'completed') as processed_emails,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_emails,
    jsonb_object_agg(source_type, count) as sources,
    SUM(content_length) as total_content_length,
    AVG(content_length)::INTEGER as average_content_length,
    (SELECT COUNT(*) FROM watchlist_matches wm 
     WHERE wm.user_id = p_user_id 
     AND DATE(wm.created_at) = p_date) as total_matches,
    (SELECT COUNT(*) FROM watchlist_matches wm 
     WHERE wm.user_id = p_user_id 
     AND DATE(wm.created_at) = p_date 
     AND wm.is_high_priority = TRUE) as high_priority_matches
  FROM ingested_emails
  WHERE user_id = p_user_id
    AND DATE(received_at) = p_date
  GROUP BY user_id
  ON CONFLICT (user_id, date) 
  DO UPDATE SET
    total_emails = EXCLUDED.total_emails,
    processed_emails = EXCLUDED.processed_emails,
    failed_emails = EXCLUDED.failed_emails,
    sources = EXCLUDED.sources,
    total_content_length = EXCLUDED.total_content_length,
    average_content_length = EXCLUDED.average_content_length,
    total_matches = EXCLUDED.total_matches,
    high_priority_matches = EXCLUDED.high_priority_matches,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;