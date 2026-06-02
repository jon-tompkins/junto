-- Automated trading v0: paper-only, admin-only.
--
-- A mandate = (user, broker account, junto signal source, NL guidelines).
-- Each tick of the cron evaluates open mandates, may submit orders.
-- Every trade carries an entry thesis, daily journal entries, and a
-- post-mortem at exit so process is auditable separately from outcome.

CREATE TABLE IF NOT EXISTS trading_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  junto_id UUID REFERENCES juntos(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  guidelines TEXT NOT NULL,
  capital_allotted_usd NUMERIC(12, 2) NOT NULL,
  max_position_pct NUMERIC(5, 2) NOT NULL DEFAULT 2.0,
  daily_loss_limit_pct NUMERIC(5, 2) NOT NULL DEFAULT 3.0,
  allowed_tickers TEXT[],
  blocked_tickers TEXT[],
  broker TEXT NOT NULL DEFAULT 'alpaca',
  mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper', 'live')),
  alpaca_key_id TEXT,
  alpaca_secret TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trading_mandates_user_idx ON trading_mandates(user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id UUID NOT NULL REFERENCES trading_mandates(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  qty NUMERIC(16, 6) NOT NULL,
  entry_price NUMERIC(12, 4),
  entry_at TIMESTAMPTZ,
  exit_price NUMERIC(12, 4),
  exit_at TIMESTAMPTZ,
  stop_price NUMERIC(12, 4),
  target_price NUMERIC(12, 4),
  alpaca_order_id TEXT,
  alpaca_position_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed', 'cancelled', 'rejected')),
  realized_pnl_usd NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trades_mandate_status_idx ON trades(mandate_id, status);
CREATE INDEX IF NOT EXISTS trades_open_idx ON trades(status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS trade_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('entry', 'daily', 'exit', 'post_mortem')),
  content TEXT NOT NULL,
  source_urls TEXT[],
  -- Set on post_mortem rows only. Process vs outcome are scored independently
  -- so we can build a 2x2 over time (skill / luck / bad-luck / lesson).
  process_score INTEGER CHECK (process_score BETWEEN 1 AND 5),
  outcome_score INTEGER CHECK (outcome_score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_journal_trade_idx ON trade_journal_entries(trade_id, created_at DESC);

-- Signal extraction audit — every cron tick logs what it saw and decided,
-- even when no trade resulted. Cheap insurance for debugging strategy drift.
CREATE TABLE IF NOT EXISTS trading_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id UUID NOT NULL REFERENCES trading_mandates(id) ON DELETE CASCADE,
  tick_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ticker TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('long', 'short', 'exit', 'hold')),
  conviction INTEGER CHECK (conviction BETWEEN 1 AND 5),
  rationale TEXT,
  source_urls TEXT[],
  decision TEXT NOT NULL CHECK (decision IN ('submitted', 'skipped_guideline', 'skipped_duplicate', 'skipped_awaiting_approval', 'skipped_market_closed')),
  decision_reason TEXT,
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS trading_signals_mandate_idx ON trading_signals(mandate_id, tick_at DESC);
