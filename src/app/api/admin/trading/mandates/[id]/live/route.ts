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

  // Perps view (Hyperliquid): collateral, margin, leverage, liquidation and the
  // live trailing stop per position — straight from HL's public info API.
  let perps: Awaited<ReturnType<typeof hlPerps>> | null = null;
  if ((mandate as any).broker === 'hyperliquid' && (mandate as any).hl_wallet_address) {
    try { perps = await hlPerps((mandate as any).hl_wallet_address, (mandate as any).mode); } catch { /* leave null */ }
  }

  return NextResponse.json({
    positions,
    perps,
    account,
    fetched_at: new Date().toISOString(),
  });
}

async function hlPerps(user: string, mode: string) {
  const url = mode === 'live' ? 'https://api.hyperliquid.xyz/info' : 'https://api.hyperliquid-testnet.xyz/info';
  const info = async (body: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    if (!r.ok) throw new Error(`HL ${r.status}`);
    return r.json();
  };
  const [state, spot, orders] = await Promise.all([
    info({ type: 'clearinghouseState', user }),
    info({ type: 'spotClearinghouseState', user }).catch(() => ({ balances: [] })),
    info({ type: 'frontendOpenOrders', user }).catch(() => []),
  ]);
  // Free spot USDC only — `hold` is margin already counted in perp accountValue.
  const spotUsdc = (spot.balances || []).filter((b: any) => b.coin === 'USDC').reduce((n: number, b: any) => n + Math.max(0, Number(b.total || 0) - Number(b.hold || 0)), 0);
  const ms = state.marginSummary || {};
  const perpValue = Number(ms.accountValue) || 0;
  // Unified account: spot USDC backs perps margin, so collateral = perp + spot.
  const collateral = perpValue + spotUsdc;
  const notional = Number(ms.totalNtlPos) || 0;
  const marginUsed = Number(ms.totalMarginUsed) || 0;
  const stops = new Map<string, { trigger: number; trailing: boolean; detail: string }>();
  for (const o of orders as any[]) {
    const ot = String(o.orderType || '').toLowerCase();
    if (!o.reduceOnly || !ot.includes('stop') || ot.includes('take profit')) continue;
    stops.set(o.coin, { trigger: Number(o.triggerPx) || 0, trailing: ot.includes('trailing'), detail: String(o.triggerCondition || '') });
  }
  const positions = (state.assetPositions || []).map((ap: any) => {
    const p = ap.position;
    const szi = Number(p.szi) || 0;
    const value = Number(p.positionValue) || 0;
    const mark = szi ? value / Math.abs(szi) : 0;
    const liq = p.liquidationPx != null ? Number(p.liquidationPx) : null;
    const stop = stops.get(p.coin) || null;
    const away = (px: number | null) => (px && mark ? Math.abs(px - mark) / mark * 100 : null);
    return {
      coin: String(p.coin),
      side: szi >= 0 ? 'long' : 'short',
      size: Math.abs(szi),
      value,
      entry: p.entryPx != null ? Number(p.entryPx) : null,
      mark,
      leverage: Number(p.leverage?.value) || 0,
      leverage_type: String(p.leverage?.type || ''),
      margin_used: Number(p.marginUsed) || 0,
      unrealized_pnl: Number(p.unrealizedPnl) || 0,
      roe_pct: (Number(p.returnOnEquity) || 0) * 100,
      funding_since_open: -(Number(p.cumFunding?.sinceOpen) || 0), // HL reports paid funding as positive
      liq_px: liq,
      liq_away_pct: away(liq),
      stop_px: stop?.trigger ?? null,
      stop_away_pct: away(stop?.trigger ?? null),
      stop_trailing: !!stop?.trailing,
      stop_detail: stop?.detail ?? null,
    };
  });
  return {
    collateral,
    perp_value: perpValue,
    spot_usdc: spotUsdc,
    notional,
    margin_used: marginUsed,
    free_collateral: Math.max(0, collateral - marginUsed),
    effective_leverage: collateral > 0 ? notional / collateral : 0,
    maintenance_margin: Number(state.crossMaintenanceMarginUsed) || 0,
    positions,
  };
}
