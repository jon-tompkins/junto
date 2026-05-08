-- Migration 031: Named watchlists for dispatch ticker filtering
-- user_watchlist (005) remains for backward compat; this is the new first-class object

CREATE TABLE IF NOT EXISTS watchlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id);

CREATE TABLE IF NOT EXISTS watchlist_tickers (
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_tickers_watchlist ON watchlist_tickers(watchlist_id);

-- Dispatches can optionally pin a watchlist for ticker-aware synthesis
ALTER TABLE newsletters_v2 ADD COLUMN IF NOT EXISTS watchlist_id UUID REFERENCES watchlists(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_tickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own watchlists" ON watchlists;
CREATE POLICY "Users manage own watchlists" ON watchlists
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage tickers in own watchlists" ON watchlist_tickers;
CREATE POLICY "Users manage tickers in own watchlists" ON watchlist_tickers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM watchlists WHERE id = watchlist_id AND user_id = auth.uid())
  );
