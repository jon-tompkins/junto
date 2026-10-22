-- Leverage a perps trade was opened at, so closed trades can show the
-- collateral (margin) committed and PnL as a return on that collateral.
-- Null for spot/equity trades; the UI falls back to the mandate cap.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS leverage numeric;
