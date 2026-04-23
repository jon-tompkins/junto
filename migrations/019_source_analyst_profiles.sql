-- Source analyst profiles: living per-source summaries of analyst focus and current positions.
-- Updated automatically after each content pull; referenced by the newsletter generator.

CREATE TABLE source_analyst_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  summary           text,             -- e.g. "macro/crypto momentum trader, focuses on BTC and rates"
  positions         jsonb NOT NULL DEFAULT '{}', -- { "BTC": { "stance": "bullish", "since": "2026-04-10", "note": "..." } }
  last_updated      timestamptz NOT NULL DEFAULT now(),
  updated_by_run_id uuid,             -- FK to newsletter_runs for traceability
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT source_analyst_profiles_source_id_key UNIQUE (source_id)
);

-- Fast lookup when generator fetches profiles for a set of source IDs
CREATE INDEX source_analyst_profiles_source_id_idx ON source_analyst_profiles (source_id);

COMMENT ON TABLE source_analyst_profiles IS
  'Living analyst profiles per source. Positions are patched after each content pull to track stance changes over time.';
COMMENT ON COLUMN source_analyst_profiles.positions IS
  'JSONB map of topic/ticker to current stance. Schema: { "<topic>": { "stance": "bullish|bearish|neutral|cautious", "since": "<date>", "note": "<optional context>" } }';
