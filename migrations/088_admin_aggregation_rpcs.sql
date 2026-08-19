-- Aggregation RPCs to avoid the PostgREST 1000-row read cap. Each returns a single
-- jsonb value (one row) so results are never row-capped, and does counting/summing/
-- distinct server-side instead of pulling raw rows into JS. See migration 087 (costs)
-- for the original instance of this bug pattern.

-- Signup/onboarding funnel: distinct users + total events per event type.
create or replace function admin_funnel_summary(since_ts timestamptz)
returns jsonb
language sql
stable
as $func$
  select coalesce(jsonb_agg(jsonb_build_object(
    'event', event, 'users', users, 'total_events', total_events)), '[]'::jsonb)
  from (
    select event, count(distinct user_id) as users, count(*) as total_events
    from funnel_events
    where created_at >= since_ts
    group by event
  ) t;
$func$;

-- Page-view analytics: totals, unique visitors, per-day series, top paths/referrers.
-- Owner (is_owner) rows are excluded from visitor metrics but counted as owner_views.
create or replace function admin_analytics_summary(since_ts timestamptz)
returns jsonb
language sql
stable
as $func$
  with pv as (
    select
      path,
      visitor_id,
      is_owner,
      to_char(created_at, 'YYYY-MM-DD') as day,
      case
        when referrer is null or btrim(referrer) = '' then 'direct / none'
        else regexp_replace(regexp_replace(regexp_replace(btrim(referrer), '^https?://', ''), '/.*$', ''), '^www\.', '')
      end as host
    from page_views
    where created_at >= since_ts
  ),
  vis as (
    select
      path,
      visitor_id,
      day,
      case when host = 'direct / none' or host ilike '%myjunto%' then 'direct / none' else host end as ref
    from pv
    where not is_owner
  )
  select jsonb_build_object(
    'total_views', (select count(*) from vis),
    'unique_visitors', (select count(distinct visitor_id) from vis where visitor_id is not null),
    'owner_views', (select count(*) from pv where is_owner),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'views', views, 'visitors', visitors) order by day)
      from (select day, count(*) as views, count(distinct visitor_id) as visitors from vis group by day) d
    ), '[]'::jsonb),
    'top_paths', coalesce((
      select jsonb_agg(jsonb_build_object('key', path, 'count', c) order by c desc)
      from (select path, count(*) c from vis group by path order by count(*) desc limit 15) p
    ), '[]'::jsonb),
    'top_referrers', coalesce((
      select jsonb_agg(jsonb_build_object('key', ref, 'count', c) order by c desc)
      from (select ref, count(*) c from vis group by ref order by count(*) desc limit 10) r
    ), '[]'::jsonb)
  );
$func$;

-- Distinct source_ids that have any stored tweets (for profile-coverage sweep).
create or replace function content_active_source_ids()
returns jsonb
language sql
stable
as $func$
  select coalesce(jsonb_agg(sid), '[]'::jsonb)
  from (select distinct source_id as sid from content_twitter) t;
$func$;

-- Newest tweet timestamp per source, as { source_id: max(posted_at) }.
create or replace function last_tweet_by_sources(source_ids text[])
returns jsonb
language sql
stable
as $func$
  select coalesce(jsonb_object_agg(source_id::text, last_at), '{}'::jsonb)
  from (
    select source_id, max(posted_at) as last_at
    from content_twitter
    where source_id = any(source_ids::uuid[])
    group by source_id
  ) t;
$func$;
