-- One-shot aggregate for the public /pulse dashboard. Wire/news accounts (exclude_handles)
-- are left out of every list so reporters don't pose as analysts.
create or replace function public_pulse_summary(window_days int default 1, asset text default null, exclude_handles text[] default '{}')
returns jsonb
language sql
stable
as $func$
  with src as (
    select id, handle_or_url as handle, display_name, avatar_url
    from sources
    where type = 'twitter' and lower(handle_or_url) <> all (select lower(x) from unnest(exclude_handles) x)
  ),
  p as (
    select sp.*, s.handle, s.display_name, s.avatar_url
    from source_positions sp
    join src s on s.id = sp.source_id
    where sp.ticker ~ '^[A-Za-z0-9.\-]{1,8}$' and (asset is null or sp.asset_class = asset)
  ),
  win as (
    select * from p where last_mentioned >= (current_date - (window_days - 1))
  ),
  o as (
    select so.*, s.handle, s.display_name
    from source_call_outcomes so
    join src s on s.id = so.source_id
    where (asset is null or exists (select 1 from p where p.ticker = so.ticker and p.asset_class = asset))
  )
  select jsonb_build_object(
    'generated_at', now(),
    'window_days', window_days,
    'kpis', jsonb_build_object(
      'tracked_sources', (select count(distinct source_id) from p),
      'open_positions', (select count(*) from p),
      'tickers', (select count(distinct ticker) from p),
      'active_in_window', (select count(*) from win),
      'new_in_window', (select count(*) from p where since >= (current_date - (window_days - 1))),
      'scored_calls', (select count(*) from o where outcome in ('win','loss')),
      'hit_rate', (select round(100.0 * count(*) filter (where outcome = 'win') / nullif(count(*), 0), 1) from o where outcome in ('win','loss'))
    ),
    'hot', coalesce((
      select jsonb_agg(t order by (t->>'sources')::int desc, (t->>'avg_conviction')::numeric desc nulls last)
      from (
        select jsonb_build_object(
          'ticker', ticker, 'asset_class', max(asset_class),
          'sources', count(distinct source_id),
          'bullish', count(*) filter (where stance = 'bullish'),
          'bearish', count(*) filter (where stance in ('bearish','cautious')),
          'neutral', count(*) filter (where stance = 'neutral'),
          'avg_conviction', round(avg(conviction)::numeric, 1)
        ) t
        from win group by ticker
        order by count(distinct source_id) desc, avg(conviction) desc nulls last
        limit 12
      ) x
    ), '[]'::jsonb),
    'consensus', coalesce((
      select jsonb_agg(t order by (t->>'sources')::int desc)
      from (
        select jsonb_build_object(
          'ticker', ticker, 'asset_class', max(asset_class),
          'sources', count(distinct source_id),
          'bullish', count(*) filter (where stance = 'bullish'),
          'bearish', count(*) filter (where stance in ('bearish','cautious')),
          'neutral', count(*) filter (where stance = 'neutral')
        ) t
        from p group by ticker
        having count(distinct source_id) >= 4
        order by count(distinct source_id) desc
        limit 60
      ) x
    ), '[]'::jsonb),
    'new_calls', coalesce((
      select jsonb_agg(t)
      from (
        select jsonb_build_object(
          'handle', handle, 'display_name', display_name, 'ticker', ticker, 'stance', stance,
          'conviction', conviction, 'note', left(coalesce(note, ''), 160), 'since', since
        ) t
        from p
        where stance in ('bullish','bearish') and since >= (current_date - (window_days - 1))
        order by since desc, conviction desc nulls last, created_at desc
        limit 12
      ) x
    ), '[]'::jsonb),
    'best_open', coalesce((
      select jsonb_agg(t)
      from (
        select jsonb_build_object('handle', handle, 'ticker', ticker, 'stance', stance,
          'return_pct', round(mark_return_pct::numeric, 1), 'alpha_pct', round(mark_alpha_pct::numeric, 1)) t
        from p
        where mark_return_pct is not null and marked_at >= now() - interval '3 days' and coalesce(is_reaction, false) = false
          and stance in ('bullish','bearish')
        order by mark_return_pct desc limit 6
      ) x
    ), '[]'::jsonb),
    'worst_open', coalesce((
      select jsonb_agg(t)
      from (
        select jsonb_build_object('handle', handle, 'ticker', ticker, 'stance', stance,
          'return_pct', round(mark_return_pct::numeric, 1), 'alpha_pct', round(mark_alpha_pct::numeric, 1)) t
        from p
        where mark_return_pct is not null and marked_at >= now() - interval '3 days' and coalesce(is_reaction, false) = false
          and stance in ('bullish','bearish')
        order by mark_return_pct asc limit 6
      ) x
    ), '[]'::jsonb),
    'recent_closed', coalesce((
      select jsonb_agg(t)
      from (
        select jsonb_build_object('handle', handle, 'ticker', ticker, 'stance', stance, 'outcome', outcome,
          'return_pct', round(return_pct::numeric, 1), 'alpha_pct', round(alpha_pct::numeric, 1), 'closed', exit_date) t
        from o
        where outcome in ('win','loss') and exit_date >= now() - interval '14 days' and coalesce(is_reaction, false) = false
        order by abs(coalesce(alpha_pct, return_pct)) desc limit 8
      ) x
    ), '[]'::jsonb)
  );
$func$;
