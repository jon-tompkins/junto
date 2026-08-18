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

  // Aggregate in Postgres (admin_cost_summary RPC) rather than pulling raw rows.
  // PostgREST caps row responses at 1000, so the old row-fetch-then-reduce path
  // silently summed only the newest 1000 rows — making every time window look
  // identical and undercounting spend. The RPC sums server-side, uncapped.
  const { data: summary, error } = await supabase.rpc('admin_cost_summary', {
    since_ts: since,
  });

  if (error) {
    console.error('[admin/costs] Query failed:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const agg = (summary || {}) as {
    total_cents?: number;
    total_calls?: number;
    by_supplier?: Record<string, { cost_cents: number; calls: number; usage_amount: number }>;
    by_operation?: Record<string, { cost_cents: number; calls: number }>;
    daily?: Array<Record<string, number | string>>;
  };

  // recent_events is a small, uncapped-enough tail for the activity view.
  const { data: recent } = await supabase
    .from('supplier_costs')
    .select('supplier, operation, cost_cents, usage_amount, usage_unit, input_tokens, output_tokens, newsletter_id, user_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100);

  return NextResponse.json({
    since,
    total_cents: agg.total_cents ?? 0,
    total_calls: agg.total_calls ?? 0,
    by_supplier: agg.by_supplier ?? {},
    by_operation: agg.by_operation ?? {},
    daily: agg.daily ?? [],
    recent_events: recent || [],
  });
}
