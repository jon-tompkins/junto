import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

// GET /api/admin/visitor-funnel?days=7 — landed → CTA click → /login → in-app, by landing
// page and referrer, plus real signups. (The event-based signup funnel is /api/admin/funnel.)
// Cron-secret callers (steward / weekly report) are allowed alongside the admin session.
export async function GET(req: NextRequest) {
  const bearer = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!bearer && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '7', 10) || 7, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabase().rpc('admin_visitor_funnel_summary', { since_ts: since });
  if (error) {
    console.error('[admin/visitor-funnel]', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const f = (data || {}) as Record<string, number>;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  return NextResponse.json({
    since,
    days,
    ...f,
    rates: {
      cta_click: pct(f.clicked_cta, f.visitors),
      login: pct(f.saw_login, f.visitors),
      in_app: pct(f.reached_app, f.visitors),
      login_to_app: pct(f.reached_app, f.saw_login),
    },
  });
}
