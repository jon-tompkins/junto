import { NextRequest, NextResponse } from 'next/server';
import {
  generatePersonalDispatchForUser,
  getProUsersForDispatch,
} from '@/lib/jobs/generate-personal-dispatch';
import { getUserIdsWithDispatchOnDate } from '@/lib/db/personal-dispatches';
import { runBounded } from '@/lib/utils/bounded';

export const maxDuration = 300;

// Stop STARTING new users after this; in-flight ones finish inside the 300s limit.
const BUDGET_MS = 210_000;
// Users are independent; PERSONAL_DISPATCH_CONCURRENCY=1 restores the old sequential loop.
const concurrency = () => Math.max(1, Number(process.env.PERSONAL_DISPATCH_CONCURRENCY) || 4);

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional ?user_id= re-runs a single user's dispatch (e.g. after a bad generation)
  // without re-sending everyone else's.
  const onlyUser = request.nextUrl.searchParams.get('user_id');
  const allUsers = (await getProUsersForDispatch()).filter((u) => !onlyUser || u.id === onlyUser);

  // Resume support: the 14:00 tick processes everyone as before. Follow-up ticks
  // (?resume=1, see vercel.json) skip anyone who already has today's dispatch stored, so a
  // tick that ran out of time budget is finished by the next one without re-sending.
  const resume = request.nextUrl.searchParams.get('resume') === '1';
  const today = new Date().toISOString().slice(0, 10);
  const alreadyDone = resume && !onlyUser ? await getUserIdsWithDispatchOnDate(allUsers.map((u) => u.id), today) : new Set<string>();
  const users = allUsers.filter((u) => !alreadyDone.has(u.id));

  const results: Array<{ userId: string; ok: boolean; reason?: string; sources?: number; tickers?: number }> = [];

  const batch = await runBounded(
    users,
    (user) => generatePersonalDispatchForUser(user),
    { concurrency: concurrency(), budgetMs: BUDGET_MS, startedAt },
  );
  for (const { item, value: r } of batch.results) {
    results.push(r.ok
      ? { userId: item.id, ok: true, sources: r.sources, tickers: r.tickers }
      : { userId: item.id, ok: false, reason: r.reason });
  }
  for (const { item, error } of batch.errors) {
    results.push({ userId: item.id, ok: false, reason: (error as any)?.message || String(error) });
  }

  return NextResponse.json({
    processed: users.length - batch.deferred.length,
    already_done: alreadyDone.size,
    deferred: batch.deferred.length, // picked up by the next tick
    succeeded: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  });
}
