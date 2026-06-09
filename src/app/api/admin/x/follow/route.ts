import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { followUser } from '@/lib/x/post';

export const dynamic = 'force-dynamic';

// POST /api/admin/x/follow  { handle: string }  — or comma-sep { handles: string }
// Follows account(s) from the configured myjunto X account.
// Auth: admin session OR `Authorization: Bearer $CRON_SECRET`.
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = bearer && cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { handle?: string; handles?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const list = body.handles
    ? body.handles.split(/[\s,]+/).map(h => h.trim()).filter(Boolean)
    : body.handle ? [body.handle.trim()] : [];
  if (list.length === 0) return NextResponse.json({ error: 'handle or handles required' }, { status: 400 });

  const results: Array<{ handle: string; ok: boolean; detail?: string }> = [];
  for (const h of list) {
    try {
      const r = await followUser(h);
      results.push({ handle: h, ok: true, detail: r.pending ? 'pending' : r.following ? 'following' : 'unknown' });
    } catch (err: any) {
      results.push({ handle: h, ok: false, detail: err?.message || String(err) });
    }
  }

  return NextResponse.json({ results });
}
