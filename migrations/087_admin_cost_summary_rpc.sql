create or replace function admin_cost_summary(since_ts timestamptz)
returns jsonb
language sql
stable
as $func$
  with base as (
    select
      supplier,
      operation,
      coalesce(cost_cents, 0)   as cost_cents,
      coalesce(usage_amount, 0) as usage_amount,
      to_char(created_at, 'YYYY-MM-DD') as day
    from supplier_costs
    where created_at >= since_ts
  ),
  day_supplier as (
    select day, supplier, sum(cost_cents) as cost_cents
    from base group by day, supplier
  ),
  daily as (
    select day,
           sum(cost_cents) as total,
           jsonb_object_agg(supplier, cost_cents) as suppliers
    from day_supplier group by day
  )
  select jsonb_build_object(
    'total_cents', coalesce((select sum(cost_cents) from base), 0),
    'total_calls', (select count(*) from base),
    'by_supplier', coalesce((
      select jsonb_object_agg(supplier, jsonb_build_object(
        'cost_cents', c, 'calls', n, 'usage_amount', u))
      from (select supplier, sum(cost_cents) c, count(*) n, sum(usage_amount) u
            from base group by supplier) s), '{}'::jsonb),
    'by_operation', coalesce((
      select jsonb_object_agg(operation, jsonb_build_object(
        'cost_cents', c, 'calls', n))
      from (select operation, sum(cost_cents) c, count(*) n
            from base group by operation) o), '{}'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'total', total) || suppliers order by day)
      from daily), '[]'::jsonb)
  );
$func$;
