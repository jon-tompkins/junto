-- Migration 019: Apify Pending Runs
-- Async pull pattern: pull-content fires the Apify batch and stores the run_id,
-- collect-twitter cron polls Apify and ingests the results once SUCCEEDED.
-- Decouples the long-running scrape from Vercel's function timeout.

CREATE TABLE IF NOT EXISTS apify_pending_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  handle_source_map JSONB NOT NULL,         -- { handle: source_id }
  since_date TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_apify_pending_runs_status
  ON apify_pending_runs(status);
CREATE INDEX IF NOT EXISTS idx_apify_pending_runs_started
  ON apify_pending_runs(started_at DESC);
