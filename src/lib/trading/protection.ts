// Reconcile protective orders for open positions.
//
// Why this exists: submitBracketOrder uses TIF=day, so the stop_loss and
// take_profit child legs of the bracket expire at market close on the day
// they were placed. Any position held overnight is left naked the next day.
// This module re-attaches a GTC OCO (stop + limit) for every open trade
// whose protective legs are gone.
//
// Safe to run repeatedly: if a position already has live sell-side
// stop + limit orders covering its qty, we skip it.

import { alpacaForMandate } from './client';
import { getSupabase } from '@/lib/db/client';
import { isCryptoTicker, findPosition } from './asset';

export interface ProtectionResult {
  ticker: string;
  action: 'protected' | 'already_protected' | 'no_position' | 'no_levels' | 'error';
  detail?: string;
  newOrderId?: string;
}

export async function protectMandate(mandateId: string): Promise<{
  mandateId: string;
  results: ProtectionResult[];
}> {
  const supabase = getSupabase();
  const { data: mandate } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('id', mandateId)
    .single();
  if (!mandate) throw new Error('Mandate not found');

  const alpaca = alpacaForMandate(mandate);

  const [openOrders, positions, openTrades] = await Promise.all([
    alpaca.listOpenOrders().catch(() => [] as any[]),
    alpaca.getPositions().catch(() => [] as any[]),
    supabase
      .from('trades')
      .select('id, ticker, side, qty, stop_price, target_price, stop_order_id, target_order_id')
      .eq('mandate_id', mandateId)
      .eq('status', 'open')
      .then((r) => r.data || []),
  ]);

  const posBySymbol = new Map<string, any>();
  for (const p of positions) posBySymbol.set(p.symbol.toUpperCase(), p);

  const ordersBySymbol = new Map<string, any[]>();
  for (const o of openOrders) {
    const s = o.symbol.toUpperCase();
    const arr = ordersBySymbol.get(s) || [];
    arr.push(o);
    ordersBySymbol.set(s, arr);
  }

  const results: ProtectionResult[] = [];
  for (const trade of openTrades) {
    const sym = trade.ticker.toUpperCase();
    try {
      // Alpaca spot crypto ONLY: Alpaca supports neither OCO/bracket nor plain
      // stop orders for crypto, so there is no resting order to attach — the
      // trade row's stop/target are enforced synthetically by the tick monitor
      // (see stops.ts). Report success so the amendment flow doesn't treat a
      // legitimately order-less position as an attach failure.
      // NOTE: Hyperliquid crypto does NOT come here — HL has native trigger
      // (tpsl) stops and flows through the native path below.
      if (mandate.broker === 'alpaca' && isCryptoTicker(trade.ticker)) {
        const stop = Number(trade.stop_price);
        const target = Number(trade.target_price);
        if (!stop && !target) {
          results.push({ ticker: sym, action: 'no_levels', detail: 'crypto: no stop/target on trade row' });
        } else {
          results.push({ ticker: sym, action: 'already_protected', detail: 'crypto: enforced synthetically by tick monitor' });
        }
        continue;
      }

      const pos = findPosition(positions, trade.ticker);
      if (!pos) {
        results.push({ ticker: sym, action: 'no_position', detail: 'Alpaca shows no live position' });
        continue;
      }

      const stop = Number(trade.stop_price);
      const target = Number(trade.target_price);
      if (!stop || !target) {
        results.push({ ticker: sym, action: 'no_levels', detail: 'Missing stop or target on trade row' });
        continue;
      }

      // Long position → exit side is 'sell'. Shorts → 'buy'. v0 is long-only,
      // but use the trade side defensively.
      const exitSide: 'sell' | 'buy' = trade.side === 'short' ? 'buy' : 'sell';

      const symOrders = ordersBySymbol.get(sym) || [];
      const sellOrders = symOrders.filter((o: any) => o.side === exitSide);

      // An OCO parent (order_class='oco' or 'bracket') is one top-level order
      // with a stop leg + limit leg nested under .legs. Detect those first so
      // we don't tear down a working bracket and re-submit.
      const hasOco = sellOrders.some((o: any) =>
        (o.order_class === 'oco' || o.order_class === 'bracket') &&
        Array.isArray(o.legs) && o.legs.length >= 1,
      );
      const hasStop = hasOco || sellOrders.some((o: any) => (o.type === 'stop' || o.type === 'stop_limit') && Number(o.stop_price) > 0);
      const hasLimit = hasOco || sellOrders.some((o: any) => o.type === 'limit' && Number(o.limit_price) > 0);
      if (hasStop && hasLimit) {
        // The position IS protected, but if we lost the order ids (stop_order_id
        // null), amendments can't cleanly MOVE the level — they fall to re-attach,
        // bail here as "already_protected", and reconcile keeps clobbering the
        // trade's stop_price back to the stale live order. Backfill the live
        // order ids so the next stop/target move uses replaceOrder instead of
        // looping. (This was the CT Tracker infinite re-propose bug.)
        const legs: any[] = hasOco
          ? (sellOrders.find((o: any) => Array.isArray(o.legs))?.legs ?? [])
          : sellOrders;
        const liveStopId = legs.find((o: any) => o.type === 'stop' || o.type === 'stop_limit')?.id;
        const liveTargetId = legs.find((o: any) => o.type === 'limit')?.id;
        const patch: Record<string, string> = {};
        if (liveStopId && trade.stop_order_id !== liveStopId) patch.stop_order_id = liveStopId;
        if (liveTargetId && trade.target_order_id !== liveTargetId) patch.target_order_id = liveTargetId;
        if (Object.keys(patch).length > 0) {
          await supabase.from('trades').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', trade.id);
        }
        results.push({ ticker: sym, action: 'already_protected' });
        continue;
      }

      // Cancel any orphaned sell-side legs before re-attaching, then wait for
      // Alpaca to release the held_for_orders qty — without the delay the
      // resubmit fails with `insufficient qty available`.
      let cancelled = 0;
      for (const o of sellOrders) {
        try { await alpaca.cancelOrder(o.id); cancelled++; } catch { /* ignore */ }
      }
      if (cancelled > 0) {
        await new Promise((r) => setTimeout(r, 2500));
      }

      // Hyperliquid trades fractional coin (0.0177 ETH), so flooring the qty
      // zeroes it and protection bails — the original CT Tracker bug. Only
      // Alpaca equities are whole-share; keep the floor there.
      const qty = mandate.broker === 'hyperliquid' ? Number(pos.qty) : Math.floor(Number(pos.qty));
      if (qty <= 0) {
        results.push({ ticker: sym, action: 'no_position', detail: 'Position qty is zero/fractional' });
        continue;
      }

      const oco = await alpaca.submitOcoExit({
        symbol: sym,
        qty,
        side: exitSide,
        stopPrice: stop,
        limitPrice: target,
        clientOrderId: `protect-${trade.id}-${Date.now()}`,
      });

      // OCO returns a parent order with two legs (stop + take_profit). Capture
      // both leg ids so amendments can replaceOrder against the right leg.
      const legs = Array.isArray((oco as any).legs) ? (oco as any).legs : [];
      const stopLeg = legs.find((l: any) => l.type === 'stop' || l.type === 'stop_limit');
      const targetLeg = legs.find((l: any) => l.type === 'limit');
      await supabase
        .from('trades')
        .update({
          stop_order_id: stopLeg?.id || oco.id,
          target_order_id: targetLeg?.id || oco.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trade.id);

      results.push({ ticker: sym, action: 'protected', newOrderId: oco.id });
    } catch (err: any) {
      results.push({ ticker: sym, action: 'error', detail: err?.message || String(err) });
    }
  }

  return { mandateId, results };
}
