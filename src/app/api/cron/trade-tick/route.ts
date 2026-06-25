import { NextRequest, NextResponse } from 'next/server';
import { runTick } from '@/lib/trading/tick';
import type { TickWindow } from '@/lib/trading/types';

export const dynamic = 'force-dynamic';
// Mandates are processed sequentially, each running extract + decide LLM calls;
// with >1 active mandate this can exceed 60s. Bump to the Pro max for headroom.
// (If the mandate count grows large, move to parallel / per-mandate invocations.)
export const maxDuration = 300;

// Trade tick — runs 5x per US trading day:
//   13:35 UTC (09:35 ET) — post-open
//   15:00 UTC (11:00 ET) — mid-morning
//   16:30 UTC (12:30 ET) — midday
//   18:00 UTC (14:00 ET) — mid-afternoon
//   19:55 UTC (15:55 ET) — close (monitor + amend only, no fresh entries)
//
// Per-mandate tweet dedup (trading_processed_tweets) prevents the same tweet
// from re-firing across ticks. UTC offsets above are EDT — update vercel.json
// before the DST flip in Nov 2026.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const window = (req.nextUrl.searchParams.get('window') as TickWindow | null) ?? inferWindowFromEt();

  const results = await runTick(window);
  return NextResponse.json({ ok: true, window, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

function inferWindowFromEt(): TickWindow {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/New_York',
  }).formatToParts(new Date());
  const hour = Number(fmt.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(fmt.find((p) => p.type === 'minute')?.value ?? '0');
  const etMin = hour * 60 + minute;
  if (etMin < 10 * 60) return 'open';            // before 10:00 ET
  if (etMin < 12 * 60) return 'mid_morning';     // 10:00–12:00
  if (etMin < 13 * 60 + 30) return 'midday';     // 12:00–13:30
  if (etMin < 15 * 60) return 'mid_afternoon';   // 13:30–15:00
  return 'close';                                // 15:00+
}
