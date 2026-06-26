-- 080: external-signal webhook source type + inbound signal store.
-- Lets an external system (e.g. a stock screener) POST trade ideas that feed the
-- same decide→propose→approve engine as twitter/wallet juntos. The mandate's
-- style+guidelines derive sizing/stops/targets — the webhook only nominates names.

-- Extend the source type whitelist (also backfill 'hyperliquid_wallet', which was
-- used in code but never added to the CHECK constraint).
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_type_check
  CHECK (type IN ('twitter','youtube','newsletter','rss','personal','hyperliquid_wallet','external_signal_webhook'));

-- Per-source bearer token for inbound auth.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS webhook_token text;
CREATE UNIQUE INDEX IF NOT EXISTS sources_webhook_token_idx
  ON sources (webhook_token) WHERE webhook_token IS NOT NULL;

-- Inbound signals store (mirrors hl_wallet_events). Dedup per (source, external_id).
CREATE TABLE IF NOT EXISTS webhook_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  ticker text NOT NULL,
  direction text NOT NULL DEFAULT 'long' CHECK (direction IN ('long','short','exit','hold')),
  conviction integer NOT NULL DEFAULT 3 CHECK (conviction BETWEEN 1 AND 5),
  rationale text,
  source_urls text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
CREATE INDEX IF NOT EXISTS webhook_signals_received_idx ON webhook_signals (received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_signals_source_idx ON webhook_signals (source_id, received_at DESC);
