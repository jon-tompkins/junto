import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Trade tick — runs 3x per US trading day:
//   13:35 UTC (09:35 ET) — post-open, after first volatility settles
//   16:30 UTC (12:30 ET) — midday
//   19:55 UTC (15:55 ET) — pre-close, exit window
//
// Note: UTC offsets above are EDT (Mar-Nov). Update vercel.json before
// the DST flip in November 2026 or add winter EST entries.
//
// V0 stub: validates auth, fetches active mandates, no-op decision.
// See docs/trading.md for the full design.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    note: 'trade-tick stub — see docs/trading.md for implementation plan',
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
