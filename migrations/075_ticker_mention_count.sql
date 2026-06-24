-- Social Pulse: distinguish total daily mention VOLUME from the analyzed count.
-- `tweet_count` stays the number of tweets actually fed to the summary (the
-- top-N analyzed, ≤ TOP_N_TWEETS). `mention_count` is the pre-slice count of
-- qualifying tweets (non-retweet, >20 chars) found that day — the real volume,
-- which varies day to day instead of pinning at the analyzed ceiling.
ALTER TABLE ticker_summaries ADD COLUMN IF NOT EXISTS mention_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ticker_reports  ADD COLUMN IF NOT EXISTS mention_count INTEGER NOT NULL DEFAULT 0;
