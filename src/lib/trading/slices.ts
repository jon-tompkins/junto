import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';

// Stable identity of the underlying broker account. Two mandates with the same
// key share one account (the only case where "slices" of one ticker can collide).
export function accountKey(m: {
  id: string;
  broker?: string | null;
  account_kind?: string | null;
  alpaca_account_id?: string | null;
  alpaca_key_id?: string | null;
  hl_wallet_address?: string | null;
}): string {
  if (m.broker === 'hyperliquid') return `h:${m.hl_wallet_address || m.id}`;
  if (m.account_kind === 'managed') return `m:${m.alpaca_account_id || m.id}`;
  return `a:${m.alpaca_key_id || m.id}`;
}

export interface OpenSlice {
  id: string;
  mandate_id: string;
  ticker: string;
  side: string;
  qty: number;
  alpaca_order_id: string | null;
  stop_order_id: string | null;
  target_order_id: string | null;
}

// Other open trades for the same ticker on the SAME broker account (excluding the
// given trade). Empty ⇒ this trade is the sole holder of the symbol on its account,
// in which case all the legacy whole-position behaviors remain safe to use.
export async function siblingSlices(mandate: any, ticker: string, excludeTradeId?: string): Promise<OpenSlice[]> {
  const supabase = getSupabase();
  const key = accountKey(mandate);
  const { data: trades } = await supabase
    .from('trades')
    .select('id, mandate_id, ticker, side, qty, alpaca_order_id, stop_order_id, target_order_id')
    .eq('ticker', String(ticker).toUpperCase())
    .eq('status', 'open');
  const rows = (trades || []).filter((t: any) => t.id !== excludeTradeId);
  if (!rows.length) return [];
  const mids = Array.from(new Set(rows.map((t: any) => t.mandate_id)));
  const { data: mans } = await supabase
    .from('trading_mandates')
    .select('id, broker, account_kind, alpaca_account_id, alpaca_key_id, hl_wallet_address')
    .in('id', mids);
  const keyByMandate = new Map((mans || []).map((m: any) => [m.id, accountKey(m)]));
  return rows.filter((t: any) => keyByMandate.get(t.mandate_id) === key) as OpenSlice[];
}

// Slice-aware close. With siblings on the account, reduce ONLY this slice's qty and
// finalize the row here (the net position survives, so the monitor's
// position-disappeared check won't fire for it). Sole holder ⇒ legacy full close
// (DELETE position / HL reduce-only-all), and the monitor finalizes as before.
export async function closeSlice(
  mandate: any,
  trade: any,
): Promise<{ mode: 'reduce' | 'full'; exitPrice: number | null }> {
  const alpaca = alpacaForMandate(mandate);
  // Cancel only THIS slice's own protective legs (never symbol-wide).
  for (const oid of [trade.stop_order_id, trade.target_order_id]) {
    if (oid) { try { await alpaca.cancelOrder(oid); } catch { /* already gone */ } }
  }
  const siblings = await siblingSlices(mandate, trade.ticker, trade.id);
  if (siblings.length === 0) {
    await alpaca.closePosition(trade.ticker);
    return { mode: 'full', exitPrice: null };
  }
  // Shared account: reduce just this slice.
  const side: 'buy' | 'sell' = trade.side === 'short' ? 'buy' : 'sell';
  const order = await alpaca.submitMarketOrder({
    symbol: trade.ticker,
    qty: Number(trade.qty),
    side,
    clientOrderId: `close-${trade.id}-${Date.now()}`,
  });
  const exitPrice = order?.filled_avg_price ? Number(order.filled_avg_price) : null;
  return { mode: 'reduce', exitPrice };
}
