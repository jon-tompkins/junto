-- Migration 025: Junto subscription gate (schema only)
-- Lays the groundwork for restricting certain juntos to paid subscribers.
-- Not enforced anywhere in application code yet — feature flag for future work.

ALTER TABLE juntos ADD COLUMN IF NOT EXISTS requires_subscription BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS subscription_tier     TEXT    NOT NULL DEFAULT 'free';
-- Values: 'free', 'pro'
