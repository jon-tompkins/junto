import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getXMetrics } from '@/lib/x/post';

export const dynamic = 'force-dynamic';

// GET /api/admin/x/metrics?ids=<comma-separated tweet ids>
// Read-only: account follower counts + per-tweet engagement. Feeds the growth
// loop's weekly scorecard. Admin session OR CRON_SECRET bearer.
export async function GET(req: NextRequest) {
  const bearer = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = bearer && cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  try {
    return NextResponse.json(await getXMetrics(ids));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
