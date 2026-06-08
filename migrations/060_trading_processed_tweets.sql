-- 060: dedup table so the same tweet doesn't get re-extracted across ticks.
-- Scoped per mandate so two mandates watching the same source still each get
-- their own chance to see a tweet (they have different guidelines).

CREATE TABLE IF NOT EXISTS trading_processed_tweets (
  mandate_id    uuid        NOT NULL REFERENCES trading_mandates(id) ON DELETE CASCADE,
  twitter_id    text        NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mandate_id, twitter_id)
);

CREATE INDEX IF NOT EXISTS trading_processed_tweets_processed_at_idx
  ON trading_processed_tweets (processed_at DESC);
