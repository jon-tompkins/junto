-- Per-user billing anchor day (1-28) for the monthly subscription-credit reset.
-- Stored clamped to 28 so every month has the day (no Feb-30 edge cases).
-- Populated from the Stripe billing_cycle_anchor on subscribe/update; existing
-- subscribers with NULL get self-healed on their first reset-cron pass.
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_anchor_day SMALLINT;

CREATE INDEX IF NOT EXISTS idx_users_sub_anchor
  ON users (subscription_anchor_day)
  WHERE subscription_tier IS DISTINCT FROM 'free';
