-- Append-only log of closed analyst calls, so we can compute genuine hit rate
-- over time. A source's live positions are a mutable JSON blob; when a stance
-- flips or a tracked ticker is dropped, the prior call's outcome is otherwise
-- lost. profile-updater writes one row here at the moment a call closes.
CREATE TABLE IF NOT EXISTS source_call_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  stance TEXT NOT NULL,                       -- stance held while the call was open
  entry_price NUMERIC,                        -- rough entry captured at first sighting
  entry_date TIMESTAMPTZ,                      -- when the stance was first taken (positions.since)
  exit_price NUMERIC,                          -- price when the call closed
  exit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  return_pct NUMERIC,                          -- direction-adjusted % return of the call
  outcome TEXT,                                -- 'win' | 'loss' | 'flat' | 'unscored'
  close_reason TEXT NOT NULL,                  -- 'flip' | 'dropped' | 'stale'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_call_outcomes_source ON source_call_outcomes(source_id);
CREATE INDEX IF NOT EXISTS idx_source_call_outcomes_ticker ON source_call_outcomes(source_id, ticker);
