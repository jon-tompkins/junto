-- 092_newsletter_history_aware.sql
-- History-aware dispatches (Oct 2026): when true, the dispatch writer gets a TRACKED
-- HISTORY block (who has held a view since when, changes of mind, track records) and
-- its history claims are checked before delivery. Rolled out on two dispatches first.
-- Idempotent, no BEGIN/COMMIT (exec_sql runner can't run those).
alter table newsletters_v2 add column if not exists history_aware boolean not null default false;
update newsletters_v2 set history_aware = true
  where id in ('231f1b52-7b26-4401-b8ee-85421062a72d',  -- CC Research
               '9c266af2-48b8-4c52-b70a-c4a971cc84cf'); -- Crypto Daily Brief
