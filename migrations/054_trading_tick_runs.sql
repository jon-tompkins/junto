create table if not exists trading_tick_runs (
  id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null references trading_mandates(id) on delete cascade,
  window text not null,
  tweets_reviewed integer not null default 0,
  signals_extracted integer not null default 0,
  decisions_made integer not null default 0,
  trades_proposed integer not null default 0,
  monitored_opened integer not null default 0,
  monitored_closed integer not null default 0,
  monitored_journaled integer not null default 0,
  errors text[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);
create index if not exists trading_tick_runs_mandate_idx on trading_tick_runs(mandate_id, created_at desc);
