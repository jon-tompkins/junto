-- Position amendments: stop/target moves or full close proposed during a tick
-- based on fresh source signals about an already-open position. Same Telegram
-- approve/skip pattern as new trades.
create table if not exists trade_amendments (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trades(id) on delete cascade,
  kind text not null check (kind in ('stop_move', 'target_move', 'close')),
  old_value numeric,
  new_value numeric,
  rationale text not null,
  source_urls text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'applied', 'skipped', 'rejected')),
  applied_at timestamptz,
  applied_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trade_amendments_trade_idx on trade_amendments(trade_id, created_at desc);
create index if not exists trade_amendments_status_idx on trade_amendments(status) where status = 'pending';

-- Store the bracket child order IDs so we can PATCH them later without re-fetching.
alter table trades add column if not exists stop_order_id text;
alter table trades add column if not exists target_order_id text;
