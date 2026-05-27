-- Migration 042: Unify personal dispatch into newsletters_v2 / newsletter_runs.
-- Drops the parallel personal_dispatches table.
--
-- Personal dispatch = a row in newsletters_v2 with is_personal=TRUE, one per user.
-- Each daily brief = a row in newsletter_runs with dispatch_date set.
-- Delivery tracking moves to newsletter_deliveries (already has delivery_method).
--
-- Safe to run idempotently. Backfills any rows that exist in personal_dispatches.

BEGIN;

-- ============================================================
-- 1. Extend newsletters_v2 with is_personal flag
-- ============================================================
ALTER TABLE newsletters_v2
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

-- One personal newsletter per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_newsletters_v2_personal_user
  ON newsletters_v2 (admin_user_id)
  WHERE is_personal = TRUE;

-- ============================================================
-- 2. Extend newsletter_runs with audio + dispatch_date
-- ============================================================
ALTER TABLE newsletter_runs
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS audio_duration_sec INTEGER,
  ADD COLUMN IF NOT EXISTS audio_script TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_date DATE;

-- Dedup guard for personal dispatches (one run per newsletter per day)
CREATE UNIQUE INDEX IF NOT EXISTS uq_newsletter_runs_dispatch_date
  ON newsletter_runs (newsletter_id, dispatch_date)
  WHERE dispatch_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_runs_audio
  ON newsletter_runs (newsletter_id, generated_at DESC)
  WHERE audio_url IS NOT NULL;

-- ============================================================
-- 3. Backfill: create personal newsletter for each user with prior dispatches
-- ============================================================
INSERT INTO newsletters_v2 (
  id, name, prompt, admin_user_id, is_public,
  schedule_cadence, junto_id, is_personal,
  send_days, default_send_windows
)
SELECT
  gen_random_uuid(),
  COALESCE(u.display_name, u.twitter_handle, 'Your') || ' Daily Dispatch',
  '',
  u.id,
  FALSE,
  'daily',
  u.featured_junto_id,
  TRUE,
  ARRAY['mon','tue','wed','thu','fri'],
  ARRAY['morning']
FROM users u
WHERE EXISTS (
    SELECT 1 FROM personal_dispatches pd WHERE pd.user_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM newsletters_v2 n WHERE n.admin_user_id = u.id AND n.is_personal = TRUE
  );

-- ============================================================
-- 4. Backfill: copy personal_dispatches rows into newsletter_runs
-- ============================================================
INSERT INTO newsletter_runs (
  id, newsletter_id, content, subject, generated_at,
  dispatch_date, audio_url, audio_bytes, audio_duration_sec, audio_script,
  metadata
)
SELECT
  pd.id,
  n.id,
  pd.content,
  pd.subject,
  pd.created_at,
  pd.dispatch_date,
  pd.audio_url,
  pd.audio_bytes,
  pd.audio_duration_sec,
  pd.audio_script,
  jsonb_build_object(
    'source_count', pd.source_count,
    'ticker_count', pd.ticker_count,
    'migrated_from', 'personal_dispatches'
  )
FROM personal_dispatches pd
JOIN newsletters_v2 n ON n.admin_user_id = pd.user_id AND n.is_personal = TRUE
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. Backfill: newsletter_deliveries from sent_email_at / sent_telegram_at
-- ============================================================
INSERT INTO newsletter_deliveries (id, run_id, user_id, delivered_at, delivery_method)
SELECT gen_random_uuid(), pd.id, pd.user_id, pd.sent_email_at, 'email'
FROM personal_dispatches pd
WHERE pd.sent_email_at IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO newsletter_deliveries (id, run_id, user_id, delivered_at, delivery_method)
SELECT gen_random_uuid(), pd.id, pd.user_id, pd.sent_telegram_at, 'telegram'
FROM personal_dispatches pd
WHERE pd.sent_telegram_at IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Drop the old table
-- ============================================================
DROP TABLE IF EXISTS personal_dispatches;

-- ============================================================
-- 7. Drop now-redundant user column (junto lives on newsletter)
-- ============================================================
-- NOTE: keeping users.featured_junto_id for now — referenced by /api/v2/featured-junto
-- and dashboard. Code refactor will repoint reads, then a future migration can drop.
-- ALTER TABLE users DROP COLUMN IF EXISTS featured_junto_id;

COMMIT;
