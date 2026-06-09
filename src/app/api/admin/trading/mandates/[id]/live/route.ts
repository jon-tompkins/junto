import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { alpacaForMandate } from '@/lib/trading/client';

export const dynamic = 'force-dynamic';

// Live Alpaca snapshot for a single mandate — positions (last price + unrealized
// P/L per symbol) + account (equity, cash). Safe to poll every 10-15s; no DB
// joins beyond the mandate lookup.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const positions: Record<string, {
    current_price: number;
    unrealized_pl: number;
    live_stop: number | null;
    live_target: number | null;
    has_stop: boolean;
    has_target: boolean;
  }> = {};
  let account: { equity: number | null; cash: number | null } = { equity: null, cash: null };
  try {
    const alp = alpacaForMandate(mandate as any);
    const [acc, live, openOrders] = await Promise.all([
      alp.getAccount().catch(() => null),
      alp.getPositions().catch(() => [] as any[]),
      alp.listOpenOrders().catch(() => [] as any[]),
    ]);
    if (acc) account = { equity: Number(acc.equity) || null, cash: Number(acc.cash) || null };

    // Bucket open sell-side stop/limit orders by symbol so the UI can show what's
    // actually protecting each position at the broker (not just what's in the DB).
    const stopBySym = new Map<string, number>();
    const targetBySym = new Map<string, number>();
    for (const o of openOrders) {
      const sym = (o.symbol || '').toUpperCase();
      if (!sym) continue;
      // We're long-only for now — protective legs are sell-side. Skip entry-side orders.
      if (o.side !== 'sell') continue;
      if ((o.type === 'stop' || o.type === 'stop_limit') && Number(o.stop_price) > 0) {
        stopBySym.set(sym, Number(o.stop_price));
      } else if (o.type === 'limit' && Number(o.limit_price) > 0) {
        targetBySym.set(sym, Number(o.limit_price));
      }
    }

    for (const p of live) {
      const sym = p.symbol.toUpperCase();
      positions[sym] = {
        current_price: Number(p.current_price) || 0,
        unrealized_pl: Number(p.unrealized_pl) || 0,
        live_stop: stopBySym.get(sym) ?? null,
        live_target: targetBySym.get(sym) ?? null,
        has_stop: stopBySym.has(sym),
        has_target: targetBySym.has(sym),
      };
    }
  } catch {
    // leave defaults
  }

  return NextResponse.json({
    positions,
    account,
    fetched_at: new Date().toISOString(),
  });
}
