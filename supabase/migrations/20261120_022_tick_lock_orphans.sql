-- Per-mandate tick lock (prevents overlapping cron / ws-triggered ticks) and orphan-position alert dedupe.
alter table trading_mandates add column if not exists tick_lock_until timestamptz;
alter table trading_mandates add column if not exists orphan_alerts jsonb not null default '{}'::jsonb;
