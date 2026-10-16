import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getReplies } from '@/lib/x/post';

export const dynamic = 'force-dynamic';

// GET /api/admin/x/replies?id=<conversation/tweet id>  (omit id → recent mentions)
// Read-only: who replied to our tweets and what they said, so questions get
// answered. Admin session OR CRON_SECRET bearer.
export async function GET(req: NextRequest) {
  const bearer = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = bearer && cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get('id')?.trim() || undefined;
  try {
    return NextResponse.json(await getReplies(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
