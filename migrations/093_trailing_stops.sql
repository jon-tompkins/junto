-- Per-mandate trailing stops (Hyperliquid). trailing_stop_pct = normal trail
-- distance from the high-water mark; trailing_stop_exit_pct = tighter trail
-- applied once the copied trader exits the position or drops off the roster.
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS trailing_stop_pct numeric;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS trailing_stop_exit_pct numeric;
-- Per-trade trail state: best price since entry + the trail % currently applied.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trail_hwm numeric;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trail_pct numeric;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trail_checked_at timestamptz;
