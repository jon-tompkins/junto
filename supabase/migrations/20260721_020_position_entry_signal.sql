-- Migration 020: Position entry anchored to the signal post
-- Entry price is now the first tradable price AT OR AFTER the opening-call post
-- (next-session open for equities / first daily bar for crypto), not a live quote
-- taken at synthesis time. Record WHEN the entry was priced (the signal instant)
-- and WHICH post it came from, so the /trades detail view can anchor the trigger
-- to the real opening call instead of any recent ticker-mentioning post.

ALTER TABLE source_positions
  ADD COLUMN IF NOT EXISTS entry_at TIMESTAMPTZ,      -- signal instant the entry_price was priced off
  ADD COLUMN IF NOT EXISTS entry_tweet_id TEXT;       -- twitter_id of the opening-call post (nullable; backfilled)
