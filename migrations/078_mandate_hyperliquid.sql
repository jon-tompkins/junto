-- Hyperliquid mandates: let a trading mandate route to HL instead of Alpaca,
-- with its own optional Telegram chat for suggestions. Agent key is stored
-- encrypted (AES-256-GCM via crypto.ts), and is only needed for execution —
-- read/suggestions need just the wallet address.
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS hl_wallet_address text;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS hl_agent_secret text;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- broker was free text defaulting to 'alpaca'; drop any restrictive check so
-- 'hyperliquid' is accepted (no-op if the constraint doesn't exist).
ALTER TABLE trading_mandates DROP CONSTRAINT IF EXISTS trading_mandates_broker_check;
