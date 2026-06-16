import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { postTweet, deleteTweet, inspectVideoUpload } from '@/lib/x/post';

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

  let body: { text?: string; replyToId?: string; imageUrls?: string[]; videoUrl?: string; debugVideo?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Diagnostic: upload the video and return the trace without posting a tweet.
  if (body.debugVideo && body.videoUrl) {
    try {
      const r = await fetch(body.videoUrl);
      if (!r.ok) throw new Error(`fetch ${body.videoUrl} → ${r.status}`);
      const mimeType = r.headers.get('content-type') || 'video/mp4';
      const data = Buffer.from(await r.arrayBuffer());
      const result = await inspectVideoUpload(data, mimeType);
      return NextResponse.json({ ok: true, debug: true, ...result });
    } catch (err: any) {
      return NextResponse.json({ ok: false, debug: true, error: err?.message || 'inspect failed' }, { status: 500 });
    }
  }

  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  try {
    const images = await Promise.all((body.imageUrls || []).map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`fetch ${u} → ${r.status}`);
      const mimeType = r.headers.get('content-type') || 'image/jpeg';
      const data = Buffer.from(await r.arrayBuffer());
      return { data, mimeType };
    }));
    let video: { data: Buffer; mimeType: string } | undefined;
    if (body.videoUrl) {
      const r = await fetch(body.videoUrl);
      if (!r.ok) throw new Error(`fetch ${body.videoUrl} → ${r.status}`);
      const mimeType = r.headers.get('content-type') || 'video/mp4';
      video = { data: Buffer.from(await r.arrayBuffer()), mimeType };
    }
    const result = await postTweet(text, {
      replyToId: body.replyToId,
      images: images.length ? images : undefined,
      video,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[x/post] failed:', err?.message, err?.stack);
    return NextResponse.json({ ok: false, error: err?.message || 'Post failed', stack: err?.stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
}

// DELETE /api/admin/x/post?id=<tweetId>
export async function DELETE(req: NextRequest) {
  const bearer = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = bearer && cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const result = await deleteTweet(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
