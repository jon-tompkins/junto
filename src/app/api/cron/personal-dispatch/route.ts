import { NextRequest, NextResponse } from 'next/server';
import {
  generatePersonalDispatchForUser,
  getProUsersForDispatch,
} from '@/lib/jobs/generate-personal-dispatch';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await getProUsersForDispatch();
  const results: Array<{ userId: string; ok: boolean; reason?: string; sources?: number; tickers?: number }> = [];

  for (const user of users) {
    try {
      const r = await generatePersonalDispatchForUser(user);
      if (r.ok) {
        results.push({ userId: user.id, ok: true, sources: r.sources, tickers: r.tickers });
      } else {
        results.push({ userId: user.id, ok: false, reason: r.reason });
      }
    } catch (err: any) {
      results.push({ userId: user.id, ok: false, reason: err?.message || String(err) });
    }
  }

  return NextResponse.json({
    processed: users.length,
    succeeded: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  });
}
