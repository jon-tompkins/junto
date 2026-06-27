// Reconcile protective orders for open positions.
//
// Why this exists: protective OCO legs can expire/cancel, leaving a position
// naked. This module re-attaches a GTC OCO (stop + limit) for every open trade
// whose protective legs are gone.
//
// Shared-account slices: when 2+ mandates hold the same ticker on one account,
// each trade ("slice") gets its OWN OCO sized to its own qty, tracked by its own
// stop_order_id/target_order_id. We then judge/cancel protection per-slice by
// order id — never symbol-wide (which would tear down a sibling's protection).
// Sole holder of a symbol ⇒ legacy whole-position behavior, unchanged.

import { alpacaForMandate } from './client';
import { getSupabase } from '@/lib/db/client';
import { siblingSlices } from './slices';

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
  const liveOrderIds = new Set<string>();
  for (const o of openOrders) {
    const s = o.symbol.toUpperCase();
    const arr = ordersBySymbol.get(s) || [];
    arr.push(o);
    ordersBySymbol.set(s, arr);
    liveOrderIds.add(o.id);
    if (Array.isArray(o.legs)) for (const l of o.legs) liveOrderIds.add(l.id);
  }

  const storeLegs = async (tradeId: string, oco: any) => {
    const legs = Array.isArray(oco?.legs) ? oco.legs : [];
    const stopLeg = legs.find((l: any) => l.type === 'stop' || l.type === 'stop_limit');
    const targetLeg = legs.find((l: any) => l.type === 'limit');
    await supabase
      .from('trades')
      .update({ stop_order_id: stopLeg?.id || oco.id, target_order_id: targetLeg?.id || oco.id, updated_at: new Date().toISOString() })
      .eq('id', tradeId);
  };

  const results: ProtectionResult[] = [];
  for (const trade of openTrades) {
    const sym = trade.ticker.toUpperCase();
    try {
      const pos = posBySymbol.get(sym);
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
      const exitSide: 'sell' | 'buy' = trade.side === 'short' ? 'buy' : 'sell';
      const siblings = await siblingSlices(mandate, sym, trade.id);

      if (siblings.length > 0) {
        // ---- SLICE MODE: judge + act per-slice, by this trade's own order ids ----
        const ownLegsLive = !!trade.stop_order_id && !!trade.target_order_id
          && liveOrderIds.has(trade.stop_order_id) && liveOrderIds.has(trade.target_order_id);
        if (ownLegsLive) {
          results.push({ ticker: sym, action: 'already_protected' });
          continue;
        }
        // Cancel only THIS slice's own stale legs (never a sibling's).
        let cancelled = 0;
        for (const oid of [trade.stop_order_id, trade.target_order_id]) {
          if (oid && liveOrderIds.has(oid)) { try { await alpaca.cancelOrder(oid); cancelled++; } catch { /* ignore */ } }
        }
        if (cancelled > 0) await new Promise((r) => setTimeout(r, 1500));
        const qty = Math.floor(Number(trade.qty));
        if (qty <= 0) {
          results.push({ ticker: sym, action: 'no_position', detail: 'Slice qty is zero/fractional' });
          continue;
        }
        const oco = await alpaca.submitOcoExit({ symbol: sym, qty, side: exitSide, stopPrice: stop, limitPrice: target, clientOrderId: `protect-${trade.id}-${Date.now()}` });
        await storeLegs(trade.id, oco);
        results.push({ ticker: sym, action: 'protected', newOrderId: oco.id });
        continue;
      }

      // ---- SOLE-HOLDER (legacy) PATH — unchanged behavior ----
      const symOrders = ordersBySymbol.get(sym) || [];
      const sellOrders = symOrders.filter((o: any) => o.side === exitSide);
      const hasOco = sellOrders.some((o: any) =>
        (o.order_class === 'oco' || o.order_class === 'bracket') && Array.isArray(o.legs) && o.legs.length >= 1);
      const hasStop = hasOco || sellOrders.some((o: any) => (o.type === 'stop' || o.type === 'stop_limit') && Number(o.stop_price) > 0);
      const hasLimit = hasOco || sellOrders.some((o: any) => o.type === 'limit' && Number(o.limit_price) > 0);
      if (hasStop && hasLimit) {
        results.push({ ticker: sym, action: 'already_protected' });
        continue;
      }
      let cancelled = 0;
      for (const o of sellOrders) {
        try { await alpaca.cancelOrder(o.id); cancelled++; } catch { /* ignore */ }
      }
      if (cancelled > 0) await new Promise((r) => setTimeout(r, 2500));
      const qty = Math.floor(Number(pos.qty));
      if (qty <= 0) {
        results.push({ ticker: sym, action: 'no_position', detail: 'Position qty is zero/fractional' });
        continue;
      }
      const oco = await alpaca.submitOcoExit({ symbol: sym, qty, side: exitSide, stopPrice: stop, limitPrice: target, clientOrderId: `protect-${trade.id}-${Date.now()}` });
      await storeLegs(trade.id, oco);
      results.push({ ticker: sym, action: 'protected', newOrderId: oco.id });
    } catch (err: any) {
      results.push({ ticker: sym, action: 'error', detail: err?.message || String(err) });
    }
  }

  return { mandateId, results };
}
