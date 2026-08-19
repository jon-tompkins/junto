import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

// GET /api/admin/analytics?days=30 — visitor/page-view aggregations.
export async function GET(req: NextRequest) {
  const allowed = await isAdminSession();
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceISO = since.toISOString();

  // Aggregate server-side (RPC). A raw row read is capped at 1000 by PostgREST, so
  // counting/deduping page_views in JS silently undercounts on any busy window.
  const { data: summary, error } = await getSupabase().rpc('admin_analytics_summary', {
    since_ts: sinceISO,
  });

  if (error) {
    console.error('[admin/analytics]', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const agg = (summary || {}) as {
    total_views?: number;
    unique_visitors?: number;
    owner_views?: number;
    daily?: Array<{ day: string; views: number; visitors: number }>;
    top_paths?: Array<{ key: string; count: number }>;
    top_referrers?: Array<{ key: string; count: number }>;
  };

  // Zero-fill the daily series across the whole window so the chart has no gaps.
  const byDay = new Map<string, { views: number; visitors: number }>();
  for (const d of agg.daily || []) byDay.set(d.day, { views: d.views, visitors: d.visitors });
  const daily: Array<{ day: string; views: number; visitors: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const entry = byDay.get(d);
    daily.push({ day: d, views: entry?.views || 0, visitors: entry?.visitors || 0 });
  }

  return NextResponse.json({
    since: sinceISO,
    days,
    capped: false,
    total_views: agg.total_views ?? 0,
    unique_visitors: agg.unique_visitors ?? 0,
    owner_views: agg.owner_views ?? 0,
    daily,
    top_paths: agg.top_paths ?? [],
    top_referrers: agg.top_referrers ?? [],
  });
}
