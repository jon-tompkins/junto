-- Alpaca Broker API (white-label) integration.
-- Users can open a managed brokerage account inside myjunto instead of
-- pasting their own Trading-API keys. The Broker-API account id replaces
-- per-mandate keys for callers that route through makeAlpaca.

ALTER TABLE users ADD COLUMN IF NOT EXISTS alpaca_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alpaca_account_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alpaca_account_created_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_alpaca_account_id_idx
  ON users(alpaca_account_id) WHERE alpaca_account_id IS NOT NULL;

ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS account_kind TEXT
  NOT NULL DEFAULT 'byo_keys'
  CHECK (account_kind IN ('byo_keys', 'managed'));

ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS alpaca_account_id TEXT;
