import { NextRequest, NextResponse } from 'next/server';
import { queueDispatchTweets } from '@/lib/dispatch-x-crosspost';

// GET /api/cron/dispatch-x-crosspost
// Scans recently-delivered PUBLIC newsletter_runs and inserts a composed tweet
// into the pending_dispatch_tweets REVIEW QUEUE for each new one found.
// Does NOT post to X — a human must approve each tweet before posting.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[dispatch-x-crosspost] CRON_SECRET is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const queued = await queueDispatchTweets();
    console.log(`[dispatch-x-crosspost] queued ${queued} tweet(s)`);
    return NextResponse.json({ queued });
  } catch (err: any) {
    console.error('[dispatch-x-crosspost]', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
