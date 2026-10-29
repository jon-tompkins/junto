-- Real-money guardrails (branch realmoney-guards). Additive + idempotent.
-- NOTE: existing live mandates are NOT auto-armed; arm them explicitly (see docs/REALMONEY.md).

ALTER TABLE trading_mandates
  ADD COLUMN IF NOT EXISTS live_armed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_armed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_armed_by UUID,
  ADD COLUMN IF NOT EXISTS live_armed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_order_notional_usd NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS max_daily_loss_usd NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS guard_day_date DATE,
  ADD COLUMN IF NOT EXISTS guard_day_start_equity NUMERIC(16, 2),
  ADD COLUMN IF NOT EXISTS guard_day_loss_usd NUMERIC(16, 2);

CREATE TABLE IF NOT EXISTS trading_user_limits (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_order_notional_usd NUMERIC(14, 2),
  max_daily_loss_usd NUMERIC(14, 2),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trading_controls (
  id TEXT PRIMARY KEY,                 -- 'global'
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO trading_controls (id, kill_switch) VALUES ('global', false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS trading_audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  actor_user_id UUID,
  mandate_id UUID,
  target_user_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS trading_audit_log_mandate_idx ON trading_audit_log (mandate_id, at DESC);
CREATE INDEX IF NOT EXISTS trading_audit_log_action_idx ON trading_audit_log (action, at DESC);
