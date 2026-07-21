-- 086_pending_dispatch_tweets_posting_fields.sql
-- Extends the dispatch-review queue with enough state to actually post and audit.
-- Safe to apply even if 085 has already been run.

alter table if exists pending_dispatch_tweets
  add column if not exists posted_tweet_id text,
  add column if not exists posted_tweet_url text,
  add column if not exists error_message text;
