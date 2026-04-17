import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

/**
 * GET /api/admin/costs
 * Returns platform-wide cost aggregations.
 *
 * Query params:
 *   since — ISO date (default: 30 days ago)
 */
export async function GET(req: NextRequest) {
  const allowed = await isAdminSession();
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sinceParam = req.nextUrl.searchParams.get('since');
  const since = sinceParam
    ? new Date(sinceParam).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getSupabase();

  // Pull all cost rows since the window start. For bigger datasets, swap to
  // a Postgres RPC / view — but this is fine at current volume.
  const { data: rows, error } = await supabase
    .from('supplier_costs')
    .select('supplier, operation, cost_cents, usage_amount, usage_unit, input_tokens, output_tokens, newsletter_id, user_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    console.error('[admin/costs] Query failed:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const events = rows || [];

  // Aggregations
  const bySupplier: Record<string, { cost_cents: number; calls: number; usage_amount: number }> = {};
  const byOperation: Record<string, { cost_cents: number; calls: number }> = {};
  const byDay: Record<string, Record<string, number>> = {}; // day -> supplier -> cost_cents

  let totalCents = 0;
  let totalCalls = 0;

  for (const row of events) {
    const cents = Number(row.cost_cents) || 0;
    totalCents += cents;
    totalCalls += 1;

    if (!bySupplier[row.supplier]) bySupplier[row.supplier] = { cost_cents: 0, calls: 0, usage_amount: 0 };
    bySupplier[row.supplier].cost_cents += cents;
    bySupplier[row.supplier].calls += 1;
    bySupplier[row.supplier].usage_amount += row.usage_amount || 0;

    if (!byOperation[row.operation]) byOperation[row.operation] = { cost_cents: 0, calls: 0 };
    byOperation[row.operation].cost_cents += cents;
    byOperation[row.operation].calls += 1;

    const day = (row.created_at as string).substring(0, 10); // YYYY-MM-DD
    if (!byDay[day]) byDay[day] = {};
    byDay[day][row.supplier] = (byDay[day][row.supplier] || 0) + cents;
  }

  // Sort byDay ascending
  const dailySeries = Object.entries(byDay)
    .map(([day, suppliers]) => ({ day, ...suppliers, total: Object.values(suppliers).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({
    since,
    total_cents: totalCents,
    total_calls: totalCalls,
    by_supplier: bySupplier,
    by_operation: byOperation,
    daily: dailySeries,
    recent_events: events.slice(0, 100),
  });
}
