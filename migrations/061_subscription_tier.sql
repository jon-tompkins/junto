-- 061: add subscription_tier column to support the new Operator tier above Pro.
-- We keep is_pro around (webhook + ad-hoc reads still use it) so this is purely
-- additive. tier='operator' implies all Pro privileges plus trading access.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'operator'));

-- Backfill from is_pro for existing rows. Operators upgrade explicitly via
-- checkout — no migration path needed since the tier doesn't exist yet.
UPDATE users SET subscription_tier = 'pro' WHERE is_pro = true AND subscription_tier = 'free';

CREATE INDEX IF NOT EXISTS users_subscription_tier_idx ON users(subscription_tier);
