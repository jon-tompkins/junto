import { NextRequest, NextResponse } from 'next/server';
import { runTick } from '@/lib/trading/tick';
import type { TickWindow } from '@/lib/trading/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Trade tick — runs 3x per US trading day:
//   13:35 UTC (09:35 ET) — post-open
//   16:30 UTC (12:30 ET) — midday
//   19:55 UTC (15:55 ET) — pre-close (monitor-only, no new entries)
//
// UTC offsets above are EDT. Update vercel.json before the DST flip in Nov 2026.
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
  const etHour = Number(
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }).format(new Date()),
  );
  if (etHour < 11) return 'open';
  if (etHour < 14) return 'midday';
  return 'close';
}
