import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { postTweet } from '@/lib/x/post';

export const dynamic = 'force-dynamic';

// POST /api/admin/x/post  { text: string, replyToId?: string }
// Sends a tweet from the configured myjunto X account.
// Auth: either an admin session cookie OR `Authorization: Bearer $CRON_SECRET`
// — the bearer path lets crons and ops agents fire tweets without a browser.
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = bearer && cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { text?: string; replyToId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  try {
    const result = await postTweet(text, body.replyToId ? { replyToId: body.replyToId } : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[x/post] failed:', err?.message, err?.stack);
    return NextResponse.json({ ok: false, error: err?.message || 'Post failed', stack: err?.stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
}
