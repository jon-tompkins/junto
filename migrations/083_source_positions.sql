-- 083_source_positions.sql
-- Normalize analyst positions out of source_analyst_profiles.positions (jsonb blob)
-- into one row per (source_id, ticker). The blob is KEPT as a maintained cache so
-- existing readers keep working; this table is the queryable per-row store
-- (cross-source queries: "who's bullish on $NVDA", leaderboard) and the write path
-- dual-writes to it. Idempotent, no BEGIN/COMMIT (exec_sql runner can't run those).

create table if not exists source_positions (
  source_id           uuid        not null,
  ticker              text        not null,
  stance              text        not null,
  since               date,
  last_mentioned      date,
  mentions            integer     not null default 0,
  conviction          integer,
  conviction_mentions integer,     -- watermark: mentions count at last conviction judgment (for periodic conviction runs)
  note                text,
  entry_price         numeric,
  target_price        numeric,
  aliases             jsonb,
  asset_class         text,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  primary key (source_id, ticker)
);

create index if not exists idx_source_positions_source      on source_positions (source_id);
create index if not exists idx_source_positions_ticker_upper on source_positions (upper(ticker));
create index if not exists idx_source_positions_stance       on source_positions (stance);

-- One-time backfill from the existing blob. ON CONFLICT DO NOTHING keeps it safe to re-run.
insert into source_positions
  (source_id, ticker, stance, since, last_mentioned, mentions, conviction, note, entry_price, target_price, aliases, asset_class)
select p.source_id,
       kv.key,
       kv.value->>'stance',
       nullif(kv.value->>'since','')::date,
       nullif(kv.value->>'last_mentioned','')::date,
       coalesce(nullif(kv.value->>'mentions','')::int, 0),
       nullif(kv.value->>'conviction','')::int,
       nullif(kv.value->>'note',''),
       nullif(kv.value->>'entry_price','')::numeric,
       nullif(kv.value->>'target_price','')::numeric,
       case when jsonb_typeof(kv.value->'aliases') = 'array' then kv.value->'aliases' else null end,
       nullif(kv.value->>'asset_class','')
from source_analyst_profiles p,
     lateral jsonb_each(p.positions) kv
where kv.value->>'stance' is not null
  and length(trim(kv.key)) > 0
on conflict (source_id, ticker) do nothing;
