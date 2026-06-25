-- Hyperliquid wallet-as-a-source: track on-chain perp traders, diff their
-- position snapshots over time, and log position-change events. Read-only,
-- approval-gated downstream — this just captures the signal.

-- Curated set of HL wallets we follow.
CREATE TABLE IF NOT EXISTS hl_tracked_wallets (
  address text PRIMARY KEY,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now()
);

-- Latest known position snapshot per wallet (diff target).
CREATE TABLE IF NOT EXISTS hl_wallet_state (
  address text PRIMARY KEY,
  account_value numeric,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Detected changes (opened / closed / increased / decreased / flipped).
CREATE TABLE IF NOT EXISTS hl_wallet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  label text,
  coin text NOT NULL,
  kind text NOT NULL,
  side text,
  prev_szi numeric,
  new_szi numeric,
  leverage numeric,
  position_value numeric,
  pct_of_account numeric,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hl_wallet_events_detected_idx ON hl_wallet_events (detected_at DESC);
CREATE INDEX IF NOT EXISTS hl_wallet_events_coin_idx ON hl_wallet_events (coin, detected_at DESC);
