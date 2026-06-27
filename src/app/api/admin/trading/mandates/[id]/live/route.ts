import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { alpacaForMandate } from '@/lib/trading/client';
import { getSupabase } from '@/lib/db/client';
import { sliceUnrealized } from '@/lib/trading/pnl';

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
    qty: number;
    side: 'long' | 'short';
    avg_entry_price: number;
    current_price: number;
    unrealized_pl: number;
    unrealized_intraday_pl: number;
    prev_day_px: number | null;
    live_stop: number | null;
    live_target: number | null;
    has_stop: boolean;
    has_target: boolean;
  }> = {};
  let account: { equity: number | null; cash: number | null } = { equity: null, cash: null };
  try {
    const alp = alpacaForMandate(mandate as any);
    const [acc, live, openOrders, openTradesRes] = await Promise.all([
      alp.getAccount().catch(() => null),
      alp.getPositions().catch(() => [] as any[]),
      alp.listOpenOrders().catch(() => [] as any[]),
      getSupabase().from('trades').select('ticker, entry_price, qty, side').eq('mandate_id', mandate.id).eq('status', 'open'),
    ]);
    if (acc) account = { equity: Number(acc.equity) || null, cash: Number(acc.cash) || null };

    // This mandate's open slices by ticker (entry/qty/side) for per-slice P/L.
    const sliceByTicker = new Map<string, { entry: number; qty: number; side: string }>();
    for (const t of (openTradesRes.data || []) as any[]) {
      const sym = String(t.ticker).toUpperCase();
      const prev = sliceByTicker.get(sym);
      const qty = Number(t.qty) || 0;
      const entry = Number(t.entry_price) || 0;
      if (prev) {
        const totalQty = prev.qty + qty;
        sliceByTicker.set(sym, { entry: totalQty ? (prev.entry * prev.qty + entry * qty) / totalQty : entry, qty: totalQty, side: t.side });
      } else {
        sliceByTicker.set(sym, { entry, qty, side: t.side });
      }
    }

    // Bucket open sell-side stop/limit orders by symbol so the UI can show what's
    // actually protecting each position at the broker (not just what's in the DB).
    const stopBySym = new Map<string, number>();
    const targetBySym = new Map<string, number>();
    // OCO/bracket parents arrive as a single top-level order with the stop +
    // take_profit legs nested under .legs — we have to walk both the top-level
    // order and its legs to find broker-truth protective prices.
    const consider = (o: any) => {
      const sym = (o.symbol || '').toUpperCase();
      if (!sym) return;
      if (o.side !== 'sell') return;
      if ((o.type === 'stop' || o.type === 'stop_limit') && Number(o.stop_price) > 0) {
        stopBySym.set(sym, Number(o.stop_price));
      } else if (o.type === 'limit' && Number(o.limit_price) > 0) {
        targetBySym.set(sym, Number(o.limit_price));
      }
    };
    for (const o of openOrders) {
      consider(o);
      if (Array.isArray(o.legs)) {
        for (const leg of o.legs) consider(leg);
      }
    }

    for (const p of live) {
      const sym = p.symbol.toUpperCase();
      const slice = sliceByTicker.get(sym);
      if (!slice) continue; // shared account → only this mandate's names
      const rawQty = Number(p.qty) || 0;
      const mark = Number(p.current_price) || 0;
      positions[sym] = {
        // Slice qty/entry/side from our books, not the broker's blended net.
        qty: slice.qty || Math.abs(rawQty),
        side: (slice.side === 'short' ? 'short' : 'long'),
        avg_entry_price: slice.entry || Number(p.avg_entry_price) || 0,
        current_price: mark,
        unrealized_pl: slice.entry ? sliceUnrealized(slice.side, slice.entry, slice.qty, mark) : Number(p.unrealized_pl) || 0,
        unrealized_intraday_pl: Number(p.unrealized_intraday_pl) || 0,
        prev_day_px: p.prev_day_px != null ? Number(p.prev_day_px) : null,
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
