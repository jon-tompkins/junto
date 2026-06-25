ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS hl_max_leverage integer NOT NULL DEFAULT 3;
