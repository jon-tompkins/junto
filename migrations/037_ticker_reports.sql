-- Ticker-level social dispatch: per-ticker summaries + daily reports
-- Shared across all users watching a given ticker.

CREATE TABLE IF NOT EXISTS ticker_summaries (
  ticker TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  tweet_count INTEGER NOT NULL DEFAULT 0,
  last_report_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticker_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  report_date DATE NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  tweet_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  tweet_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker, report_date)
);

CREATE INDEX IF NOT EXISTS idx_ticker_reports_ticker_date
  ON ticker_reports (ticker, report_date DESC);
