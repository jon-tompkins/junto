-- 085_pending_dispatch_tweets.sql
-- Review queue for auto-composed dispatch→X crossposts.
-- NOT applied to prod — apply manually via exec_sql RPC and record in schema_migrations.
-- Idempotent (create if not exists).
--
-- Workflow: cron inserts one row per newly-delivered PUBLIC newsletter_run.
-- Human reviews, edits tweet_text if needed, then approves for posting.
-- Nothing in this pipeline posts to X automatically.

create table if not exists pending_dispatch_tweets (
  id              bigserial    primary key,
  newsletter_run_id  text      not null unique,   -- newsletter_runs.id
  newsletter_id   text         not null,
  tweet_text      text         not null,
  tickers         text[]       not null default '{}',
  permalink       text         not null,
  status          text         not null default 'pending',  -- pending | approved | rejected | posted
  created_at      timestamptz  not null default now(),
  reviewed_at     timestamptz
);

create index if not exists pending_dispatch_tweets_status_idx on pending_dispatch_tweets(status);
create index if not exists pending_dispatch_tweets_created_idx on pending_dispatch_tweets(created_at desc);
