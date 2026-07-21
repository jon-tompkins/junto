import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { updatePendingDispatchTweet } from '@/lib/db/pending-dispatch-tweets';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
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

  let body: { tweet_text?: string; status?: 'pending' | 'approved' | 'rejected' | 'posted' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.tweet_text !== undefined && body.tweet_text.trim().length === 0) {
    return NextResponse.json({ error: 'tweet_text cannot be empty' }, { status: 400 });
  }

  try {
    await updatePendingDispatchTweet(numericId, {
      tweet_text: body.tweet_text?.trim(),
      status: body.status,
      error_message: null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update dispatch tweet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
