-- 082: two-sided Telegram bind handshake. /bind <mandate-id> in a group records a
-- PENDING binding (proposed chat); it only becomes the live telegram_chat_id once
-- the owner confirms (in Telegram or on the web mandate page).
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS pending_tg_chat_id text;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS pending_tg_chat_title text;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS pending_tg_requested_at timestamptz;
