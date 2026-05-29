-- 048: add the unique (newsletter_id, dispatch_date) constraint that
-- upsertPersonalDispatch / generate-personal-dispatch relies on.
--
-- The May-27 refactor switched personal dispatches onto newsletter_runs and
-- the upsert uses `onConflict: 'newsletter_id,dispatch_date'`, but the table
-- never had a matching unique index. Every cron run since then has failed
-- with: "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Dedup any same-day collisions before adding the index.

BEGIN;

WITH dups AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY newsletter_id, dispatch_date
           ORDER BY generated_at DESC, id DESC
         ) AS rn
  FROM newsletter_runs
  WHERE dispatch_date IS NOT NULL
)
DELETE FROM newsletter_runs
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_newsletter_runs_newsletter_dispatch_date
  ON newsletter_runs (newsletter_id, dispatch_date)
  WHERE dispatch_date IS NOT NULL;

COMMIT;
