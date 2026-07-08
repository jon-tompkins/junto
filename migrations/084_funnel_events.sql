-- 084_funnel_events.sql
-- Funnel instrumentation: one row per named event per user.
-- NOT applied to prod via the migration runner — apply manually via exec_sql RPC
-- and record in schema_migrations when ready.
-- Idempotent (create if not exists).

create table if not exists funnel_events (
  id          bigserial    primary key,
  user_id     uuid         not null,
  event       text         not null,   -- 'signup' | 'onboarding_complete' | 'subscribe' | 'junto_create'
  metadata    jsonb,                   -- optional context (tier, junto_id, plan, etc.)
  created_at  timestamptz  not null default now()
);

create index if not exists funnel_events_user_id_idx on funnel_events(user_id);
create index if not exists funnel_events_event_idx   on funnel_events(event);
create index if not exists funnel_events_created_idx on funnel_events(created_at desc);

-- Convenience view: cohort funnel counts per event, rolling 90 days.
create or replace view funnel_summary as
select
  event,
  count(distinct user_id)  as users,
  count(*)                 as total_events,
  date_trunc('day', created_at) as day
from funnel_events
where created_at >= now() - interval '90 days'
group by event, date_trunc('day', created_at)
order by day desc, event;
