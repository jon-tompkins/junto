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

  // Aggregate distinct-users + totals server-side (RPC) — a raw row read is capped
  // at 1000 by PostgREST, which would silently undercount over the window.
  const { data, error } = await getSupabase().rpc('admin_funnel_summary', { since_ts: since });

  if (error) {
    // funnel_events table may not exist yet (migration not applied) — return empty gracefully.
    if (error.code === '42P01') return NextResponse.json({ rows: [], days });
    console.error('[admin/funnel]', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const EVENT_ORDER = ['signup', 'onboarding_complete', 'subscribe', 'junto_create'];
  const rows: FunnelRow[] = ((data || []) as FunnelRow[])
    .map((r) => ({ event: r.event, users: Number(r.users) || 0, total_events: Number(r.total_events) || 0 }))
    .sort(
      (a, b) =>
        (EVENT_ORDER.indexOf(a.event) + 1 || 999) - (EVENT_ORDER.indexOf(b.event) + 1 || 999),
    );

  return NextResponse.json({ rows, days });
}
