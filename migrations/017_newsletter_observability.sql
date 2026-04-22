-- Newsletter schema cleanup + observability
--
-- 1. Keywords belong on the newsletter, not the user.
-- 2. Drop stale user-level columns (last_newsletter_sent, custom_prompt).
--    In the v2 system, newsletters_v2.prompt is the per-newsletter custom prompt.
-- 3. Add status + error_message to newsletter_runs so every generation attempt
--    (including skips and failures) is queryable. Also make content nullable so
--    failed runs can be stored without content.

-- ── newsletters_v2: add keywords ─────────────────────────────────────────────
ALTER TABLE newsletters_v2
  ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';

-- ── users: drop stale columns ────────────────────────────────────────────────
ALTER TABLE users
  DROP COLUMN IF EXISTS last_newsletter_sent,
  DROP COLUMN IF EXISTS custom_prompt;

-- ── newsletter_runs: observability ───────────────────────────────────────────
-- Make content nullable so skipped/failed attempts can be recorded.
ALTER TABLE newsletter_runs
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE newsletter_runs
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'delivered'
    CHECK (status IN (
      'delivered',           -- generated + sent to all subscribers
      'partial_delivered',   -- generated + sent to some subscribers
      'generated',           -- generated but no subscribers to send to
      'generated_not_delivered', -- generated but delivery failed (e.g. no credits)
      'skipped',             -- not generated (no content, no sources, etc.)
      'error'                -- unhandled exception
    )),
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for querying recent failures quickly
CREATE INDEX IF NOT EXISTS idx_newsletter_runs_status ON newsletter_runs (status);
CREATE INDEX IF NOT EXISTS idx_newsletter_runs_generated_at ON newsletter_runs (generated_at DESC);
