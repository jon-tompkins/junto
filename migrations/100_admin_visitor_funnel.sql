-- Visitor funnel from first-party page_views (+ real signups from users).
-- Steps are distinct non-owner visitors: landed -> clicked a signup CTA -> reached /login
-- -> reached /welcome|/onboarding|/dashboard (post-auth). CTA clicks are logged by
-- SignupCTA as virtual views at /cta/<context>/<subject>.
create or replace function admin_visitor_funnel_summary(since_ts timestamptz)
returns jsonb
language sql
stable
as $func$
  with pv as (
    select
      visitor_id, path, created_at,
      case
        when referrer is null or btrim(referrer) = '' then 'direct / none'
        else regexp_replace(regexp_replace(regexp_replace(btrim(referrer), '^https?://', ''), '/.*$', ''), '^www\.', '')
      end as host
    from page_views
    where created_at >= since_ts and not is_owner and visitor_id is not null
      and path !~ '^/(api|_next)/'
  ),
  v as (
    select
      visitor_id,
      min(created_at) as first_seen,
      -- first non-CTA page the visitor saw = their landing page class
      (array_agg(case
          when path = '/' then 'home'
          when path like '/tickers/%' or path like '/positions/%' then 'ticker'
          when path like '/sources/%' or path = '/sources' then 'analyst'
          when path like '/newsletter/%' or path like '/junto/%' or path = '/juntos' then 'dispatch'
          when path in ('/leaderboard','/top-calls','/trades','/explore') then 'discovery'
          when path like '/trade%' then 'trade'
          else 'other' end
        order by created_at) filter (where path not like '/cta/%'))[1] as landing,
      bool_or(path like '/cta/%') as clicked_cta,
      bool_or(path = '/login') as saw_login,
      bool_or(path in ('/welcome','/onboarding','/dashboard')) as reached_app,
      (array_agg(host order by created_at))[1] as ref
    from pv
    group by visitor_id
  )
  select jsonb_build_object(
    'visitors', (select count(*) from v),
    'clicked_cta', (select count(*) from v where clicked_cta),
    'saw_login', (select count(*) from v where saw_login),
    'reached_app', (select count(*) from v where reached_app),
    'signups', (select count(*) from users where created_at >= since_ts),
    'by_landing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'landing', landing, 'visitors', n, 'clicked_cta', cta, 'saw_login', lg, 'reached_app', app
      ) order by n desc)
      from (
        select landing, count(*) n,
          count(*) filter (where clicked_cta) cta,
          count(*) filter (where saw_login) lg,
          count(*) filter (where reached_app) app
        from v where landing is not null group by landing
      ) l
    ), '[]'::jsonb),
    'by_referrer', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ref', ref, 'visitors', n, 'clicked_cta', cta, 'saw_login', lg
      ) order by n desc)
      from (
        select case when ref ilike '%myjunto%' then 'direct / none' else ref end as ref,
          count(*) n,
          count(*) filter (where clicked_cta) cta,
          count(*) filter (where saw_login) lg
        from v group by 1 order by count(*) desc limit 10
      ) r
    ), '[]'::jsonb),
    'cta_by_context', coalesce((
      select jsonb_agg(jsonb_build_object('key', k, 'clicks', c) order by c desc)
      from (
        select split_part(path, '/', 3) as k, count(*) c
        from pv where path like '/cta/%' group by 1
      ) x
    ), '[]'::jsonb)
  );
$func$;
