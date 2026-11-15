import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { runTick } from '@/lib/trading/tick';
import { getWalletState, diffWalletPositions, type WalletPosition } from '@/lib/trading/hl-wallets';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // poll (~10s) + an event-driven HL tick (LLM decide) when signals land

// Polls each tracked Hyperliquid wallet, diffs its positions against the last
// snapshot, and logs position-change events. First run per wallet just seeds
// the snapshot (no events). Read-only; no signing, no execution.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: wallets } = await supabase
    .from('hl_tracked_wallets')
    .select('address, label')
    .eq('is_active', true);

  const results: Record<string, unknown> = {};
  let totalEvents = 0;
  let entrySignals = 0; // opened / increased / flipped — the events a copy-trade can act on

  for (const w of wallets || []) {
    try {
      const state = await getWalletState(w.address);

      const { data: prevRow } = await supabase
        .from('hl_wallet_state')
        .select('positions')
        .eq('address', w.address)
        .maybeSingle();
      const prev: WalletPosition[] = (prevRow?.positions as WalletPosition[]) || [];
      const seeded = !!prevRow;

      const events = seeded ? diffWalletPositions(prev, state) : [];

      await supabase.from('hl_wallet_state').upsert({
        address: w.address,
        account_value: state.accountValue,
        positions: state.positions,
        updated_at: new Date().toISOString(),
      });

      if (events.length > 0) {
        await supabase.from('hl_wallet_events').insert(
          events.map((e) => ({
            address: w.address,
            label: w.label,
            coin: e.coin,
            kind: e.kind,
            side: e.side,
            prev_szi: e.prevSzi,
            new_szi: e.newSzi,
            leverage: e.leverage,
            position_value: e.positionValue,
            pct_of_account: Number(e.pctOfAccount.toFixed(2)),
          })),
        );
      }

      totalEvents += events.length;
      entrySignals += events.filter((e) => e.kind === 'opened' || e.kind === 'increased' || e.kind === 'flipped').length;
      results[w.label || w.address] = { positions: state.positions.length, events: events.length, seeded };
    } catch (err: any) {
      results[w.label || w.address] = { error: String(err.message).slice(0, 160) };
    }
  }

  // Event-driven tick: don't wait for the hourly cron when a followed trader
  // just opened/added/flipped a position. The tick's own gates (cooldown, chase,
  // exposure, staleness) decide whether to copy it.
  let tick: unknown = null;
  if (entrySignals > 0 && req.nextUrl.searchParams.get('no_tick') !== '1') {
    try {
      tick = await runTick('midday', { broker: 'hyperliquid' });
    } catch (err: any) {
      tick = { error: String(err?.message || err).slice(0, 200) };
    }
  }

  return NextResponse.json({ ok: true, wallets: (wallets || []).length, events: totalEvents, entrySignals, tick, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
