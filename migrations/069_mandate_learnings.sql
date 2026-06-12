-- The trading engine's parallel "trading thoughts": a synthesized doc derived
-- from closed-trade post-mortems, process/outcome scores, and user notes.
-- use_learnings gates whether the proposal engine references it (off = mandate only).
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS learnings TEXT;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS learnings_updated_at TIMESTAMPTZ;
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS use_learnings BOOLEAN NOT NULL DEFAULT false;
