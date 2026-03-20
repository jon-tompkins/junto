-- Migration 009: Create research_reports table for storing reports in Supabase
-- Previously reports were stored in GitHub (jon-tompkins/Agent-Reports)
-- Now the processor stores them directly in the database

CREATE TABLE IF NOT EXISTS research_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  ticker VARCHAR(10),
  content TEXT NOT NULL,
  summary TEXT,
  rating TEXT,
  type TEXT DEFAULT 'deep-dive' CHECK (type IN ('deep-dive', 'scan', 'research')),
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_by UUID REFERENCES users(id),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_research_reports_ticker ON research_reports(ticker);
CREATE INDEX IF NOT EXISTS idx_research_reports_visibility ON research_reports(visibility);
CREATE INDEX IF NOT EXISTS idx_research_reports_date ON research_reports(date DESC);
CREATE INDEX IF NOT EXISTS idx_research_reports_type ON research_reports(type);
CREATE INDEX IF NOT EXISTS idx_research_reports_requested_by ON research_reports(requested_by);
