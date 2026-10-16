-- Mandate autopilot: execution mode + hard risk gates for unattended trading.
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'approval';
ALTER TABLE trading_mandates DROP CONSTRAINT IF EXISTS trading_mandates_execution_mode_check;
ALTER TABLE trading_mandates ADD CONSTRAINT trading_mandates_execution_mode_check CHECK (execution_mode IN ('approval', 'auto_exit', 'full_auto'));
-- total open notional ÷ equity ceiling (HL)
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS max_total_leverage numeric DEFAULT 3;
-- entry filters
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS max_new_positions_per_day integer DEFAULT 6;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS coin_cooldown_hours numeric DEFAULT 12;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS min_coin_volume_usd numeric DEFAULT 5000000;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS max_entry_chase_pct numeric DEFAULT 2;
-- sqrt sizing: weight = sqrt(copied notional / ref), clamped to [0.2, 1]
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS sizing_ref_notional_usd numeric DEFAULT 1000000;
-- daily loss gate state
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS day_start_equity numeric;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS day_start_date date;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS daily_loss_tripped_at timestamptz;
