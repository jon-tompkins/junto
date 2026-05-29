-- 049: replace 048's partial unique index with a full one.
--
-- Supabase's upsert onConflict cannot infer a partial unique index, so
-- ON CONFLICT (newsletter_id, dispatch_date) still failed after 048.
-- Postgres treats NULLs as distinct in unique indexes by default, so
-- multiple newsletter_runs rows with null dispatch_date stay legal.

BEGIN;

DROP INDEX IF EXISTS uniq_newsletter_runs_newsletter_dispatch_date;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_newsletter_runs_newsletter_dispatch_date
  ON newsletter_runs (newsletter_id, dispatch_date);

COMMIT;
