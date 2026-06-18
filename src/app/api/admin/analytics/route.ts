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

  const { data, error } = await getSupabase()
    .from('page_views')
    .select('path, referrer, visitor_id, is_owner, created_at')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    console.error('[admin/analytics]', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = data || [];
  // Visitors excluding the owner (Jon) — the "other than me" number.
  const visitorRows = rows.filter((r) => !r.is_owner);

  const uniq = (vals: (string | null)[]) => new Set(vals.filter(Boolean) as string[]).size;

  const topPaths: Record<string, number> = {};
  const topReferrers: Record<string, number> = {};
  const byDay: Record<string, { views: number; visitors: Set<string> }> = {};

  for (const r of visitorRows) {
    topPaths[r.path] = (topPaths[r.path] || 0) + 1;

    let ref = (r.referrer || '').trim();
    if (ref) {
      try {
        ref = new URL(ref).hostname.replace(/^www\./, '');
      } catch {
        // keep raw
      }
    }
    const refKey = ref && !ref.includes('myjunto') ? ref : 'direct / none';
    topReferrers[refKey] = (topReferrers[refKey] || 0) + 1;

    const day = (r.created_at as string).slice(0, 10);
    if (!byDay[day]) byDay[day] = { views: 0, visitors: new Set() };
    byDay[day].views += 1;
    if (r.visitor_id) byDay[day].visitors.add(r.visitor_id);
  }

  // Fill the daily series across the whole window so the chart has no gaps.
  const daily: Array<{ day: string; views: number; visitors: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const entry = byDay[d];
    daily.push({ day: d, views: entry?.views || 0, visitors: entry?.visitors.size || 0 });
  }

  const sortDesc = (obj: Record<string, number>, n: number) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));

  return NextResponse.json({
    since: sinceISO,
    days,
    capped: rows.length >= 10000,
    total_views: visitorRows.length,
    unique_visitors: uniq(visitorRows.map((r) => r.visitor_id)),
    owner_views: rows.length - visitorRows.length,
    daily,
    top_paths: sortDesc(topPaths, 15),
    top_referrers: sortDesc(topReferrers, 10),
  });
}
