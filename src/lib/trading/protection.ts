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
      .select('id, ticker, side, qty, stop_price, target_price, bracket_order_id')
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

      // Long position → exit side is 'sell'. Shorts → 'buy'. v0 is long-only,
      // but use the trade side defensively.
      const exitSide: 'sell' | 'buy' = trade.side === 'short' ? 'buy' : 'sell';

      const symOrders = ordersBySymbol.get(sym) || [];
      const sellOrders = symOrders.filter((o: any) => o.side === exitSide);
      const hasStop = sellOrders.some((o: any) => (o.type === 'stop' || o.type === 'stop_limit') && Number(o.stop_price) > 0);
      const hasLimit = sellOrders.some((o: any) => o.type === 'limit' && Number(o.limit_price) > 0);
      if (hasStop && hasLimit) {
        results.push({ ticker: sym, action: 'already_protected' });
        continue;
      }

      // Cancel any orphaned sell-side legs before re-attaching, so we don't
      // end up with duplicates.
      for (const o of sellOrders) {
        try { await alpaca.cancelOrder(o.id); } catch { /* ignore */ }
      }

      const qty = Math.floor(Number(pos.qty));
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

      // Track the new bracket id so /live and the UI can find it later.
      await supabase
        .from('trades')
        .update({ bracket_order_id: oco.id, updated_at: new Date().toISOString() })
        .eq('id', trade.id);

      results.push({ ticker: sym, action: 'protected', newOrderId: oco.id });
    } catch (err: any) {
      results.push({ ticker: sym, action: 'error', detail: err?.message || String(err) });
    }
  }

  return { mandateId, results };
}
