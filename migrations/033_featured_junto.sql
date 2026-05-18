-- Migration 033: Add featured_junto_id to users
-- Each user can pin one junto as their "featured" signal layer.
-- Auto-populated on first dashboard load; can be changed to any junto.

ALTER TABLE users ADD COLUMN IF NOT EXISTS featured_junto_id UUID REFERENCES juntos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_featured_junto ON users(featured_junto_id) WHERE featured_junto_id IS NOT NULL;
