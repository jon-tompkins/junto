-- Telegram delivery for newsletters.
--
-- Per-user chat_id (not per-subscription): users link once, all subscriptions
-- route to that chat. If a user unlinks, TG subscriptions fall back to email
-- silently unless delivery_channel is explicitly 'telegram' only.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

-- Per-subscription delivery channel. 'email' keeps existing behavior.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS delivery_channel TEXT NOT NULL DEFAULT 'email'
    CHECK (delivery_channel IN ('email', 'telegram'));

-- One-time link codes: user generates a code in-app, DMs the bot with /start <code>,
-- webhook verifies and writes chat_id back to users table.
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user ON telegram_link_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_expires ON telegram_link_codes (expires_at) WHERE consumed_at IS NULL;
