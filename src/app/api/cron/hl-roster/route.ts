import { NextRequest, NextResponse } from 'next/server';
import { computeRoster, currentRoster, syncRosterToJunto, ROSTER_JUNTO_ID } from '@/lib/trading/hl-roster';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily: recompute the top-N copyable Hyperliquid traders and sync them into the
// "HL Top Traders (dynamic)" junto. ?dry_run=1 returns the roster without writing.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';
  try {
    const incumbents = await currentRoster(ROSTER_JUNTO_ID);
    const result = await computeRoster(incumbents);
    // Never empty the roster on a bad leaderboard pull.
    if (result.roster.length < 3) {
      return NextResponse.json({ ok: false, error: `only ${result.roster.length} wallets passed — roster left unchanged`, ...result }, { status: 500 });
    }
    const sync = dryRun ? null : await syncRosterToJunto(ROSTER_JUNTO_ID, result.roster);
    return NextResponse.json({ ok: true, dry_run: dryRun, incumbents: incumbents.length, sync, ...result, rejected: result.rejected.slice(0, 40) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'failed';
    console.error('[hl-roster]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
