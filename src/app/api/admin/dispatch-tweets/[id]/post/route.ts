import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getPendingDispatchTweet, updatePendingDispatchTweet } from '@/lib/db/pending-dispatch-tweets';
import { postTweet } from '@/lib/x/post';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const row = await getPendingDispatchTweet(numericId);
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (row.status === 'posted') {
    return NextResponse.json({ error: 'Already posted' }, { status: 409 });
  }
  if (!row.tweet_text.trim()) {
    return NextResponse.json({ error: 'tweet_text is empty' }, { status: 400 });
  }

  try {
    const result = await postTweet(row.tweet_text);
    await updatePendingDispatchTweet(numericId, {
      status: 'posted',
      posted_tweet_id: result.id,
      posted_tweet_url: result.url,
      error_message: null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Post failed';
    await updatePendingDispatchTweet(numericId, { error_message: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
