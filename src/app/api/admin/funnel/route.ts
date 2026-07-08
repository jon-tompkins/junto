import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

export interface FunnelRow {
  event: string;
  users: number;
  total_events: number;
}

// GET /api/admin/funnel?days=30
export async function GET(req: NextRequest) {
  const allowed = await isAdminSession();
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 1),
    365,
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabase()
    .from('funnel_events')
    .select('event, user_id')
    .gte('created_at', since);

  if (error) {
    // funnel_events table may not exist yet (migration not applied) — return empty gracefully.
    if (error.code === '42P01') return NextResponse.json({ rows: [], days });
    console.error('[admin/funnel]', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const EVENT_ORDER = ['signup', 'onboarding_complete', 'subscribe', 'junto_create'];
  const agg = new Map<string, { users: Set<string>; total: number }>();
  for (const row of data || []) {
    const a = agg.get(row.event) ?? { users: new Set(), total: 0 };
    a.users.add(row.user_id);
    a.total += 1;
    agg.set(row.event, a);
  }

  const rows: FunnelRow[] = [...agg.entries()]
    .map(([event, a]) => ({ event, users: a.users.size, total_events: a.total }))
    .sort(
      (a, b) =>
        (EVENT_ORDER.indexOf(a.event) + 1 || 999) - (EVENT_ORDER.indexOf(b.event) + 1 || 999),
    );

  return NextResponse.json({ rows, days });
}
