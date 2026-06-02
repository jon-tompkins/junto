-- User-set stop/target price levels for tracked positions.
-- Independent of analyst-derived target_price fields (which come from LLM
-- extraction of tweets); this is the user's own annotation.

create table if not exists user_position_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ticker text not null,
  stop_price numeric,
  target_price numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create index if not exists user_position_levels_user_idx on user_position_levels(user_id);
create index if not exists user_position_levels_ticker_idx on user_position_levels(ticker);
