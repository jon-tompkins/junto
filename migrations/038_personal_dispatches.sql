-- Personal daily dispatch: per-user "your day" brief combining featured junto + watchlist.
-- One row per user per day. Delivery timestamps record email + Telegram send.

CREATE TABLE IF NOT EXISTS personal_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dispatch_date DATE NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  ticker_count INTEGER NOT NULL DEFAULT 0,
  sent_email_at TIMESTAMPTZ,
  sent_telegram_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dispatch_date)
);

CREATE INDEX IF NOT EXISTS idx_personal_dispatches_user_date
  ON personal_dispatches (user_id, dispatch_date DESC);
