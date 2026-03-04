-- Migration 006: Research Request System
-- Adds deep dive request tracking and user credits

-- Add credits to users (default 10 for free tier)
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 10;

-- Research requests table
CREATE TABLE IF NOT EXISTS research_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  report_id VARCHAR(100), -- references external report ID from Agent-Reports
  error_message TEXT,
  credits_charged INTEGER DEFAULT 5
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_research_requests_user_id ON research_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_research_requests_status ON research_requests(status);
CREATE INDEX IF NOT EXISTS idx_research_requests_created ON research_requests(created_at DESC);

-- Enable RLS
ALTER TABLE research_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "Users can view own requests" ON research_requests
  FOR SELECT USING (auth.uid() = user_id OR TRUE); -- TRUE for now = public

-- Users can create requests
CREATE POLICY "Users can create requests" ON research_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can update (for background processing)
CREATE POLICY "Service can update requests" ON research_requests
  FOR UPDATE USING (TRUE);

-- Grant usage
GRANT ALL ON research_requests TO authenticated;
GRANT ALL ON research_requests TO service_role;

-- Seed existing users with credits if they don't have any
UPDATE users SET credits = 10 WHERE credits IS NULL;
