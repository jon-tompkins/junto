// Alpaca → DB reconciler. Alpaca is the source of truth for live position
// state: any drift between what the broker shows and what we have in the
// `trades` table is corrected by overwriting the DB row.
//
// What this fixes that monitor.ts doesn't:
//   - Quantity drift (partial fills, manual trims at the broker)
//   - Stop/target drift (manual edits in Alpaca, protector re-attaching at
//     a different price, amendments applied directly through the broker)
//
// What this does NOT do:
//   - Close trades whose positions disappeared — monitor.ts owns that path
//     because it also needs to compute realized P/L and write the exit +
//     post-mortem journal entries.
//   - Auto-import untracked positions — those are flagged as
//     `untracked_position` so a human can decide whether to adopt them.
//
// Safe to run repeatedly: every step is idempotent (compare-then-update).

import { alpacaForMandate } from './client';
import { getSupabase } from '@/lib/db/client';
import { siblingSlices } from './slices';

export type ReconcileAction =
  | 'in_sync'
  | 'qty_synced'
  | 'levels_synced'
  | 'qty_and_levels_synced'
  | 'no_position'
  | 'untracked_position'
  | 'error';

export interface ReconcileResult {
  ticker: string;
  action: ReconcileAction;
  detail?: string;
  before?: { qty?: number; stop?: number | null; target?: number | null };
  after?: { qty?: number; stop?: number | null; target?: number | null };
}

const EPS = 0.005; // 0.5% — under this we treat prices as unchanged

export async function reconcileMandate(mandateId: string): Promise<{
  mandateId: string;
  results: ReconcileResult[];
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
      .select('id, ticker, side, qty, stop_price, target_price')
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

  const trackedSymbols = new Set<string>();
  const results: ReconcileResult[] = [];

  for (const trade of openTrades) {
    const sym = trade.ticker.toUpperCase();
    trackedSymbols.add(sym);
    try {
      const pos = posBySymbol.get(sym);
      if (!pos) {
        // monitor.ts will close this on its next pass — we just report.
        results.push({ ticker: sym, action: 'no_position', detail: 'Alpaca shows no live position; monitor will close on next tick' });
        continue;
      }

      // Shared-account slice: the broker's NET qty and symbol-wide orders span
      // multiple mandates, so syncing this slice's qty/levels off them would be
      // wrong. protection.ts owns per-slice levels (by order id); skip net sync.
      const siblings = await siblingSlices(mandate, sym, trade.id);
      if (siblings.length > 0) {
        results.push({ ticker: sym, action: 'in_sync', detail: 'slice (shared symbol) — net sync skipped' });
        continue;
      }

      const liveQty = Math.floor(Math.abs(Number(pos.qty)));
      const dbQty = Number(trade.qty);

      const exitSide: 'sell' | 'buy' = trade.side === 'short' ? 'buy' : 'sell';
      const symOrders = (ordersBySymbol.get(sym) || []).filter((o: any) => o.side === exitSide);
      const stopOrder = symOrders.find((o: any) => (o.type === 'stop' || o.type === 'stop_limit') && Number(o.stop_price) > 0);
      const limitOrder = symOrders.find((o: any) => o.type === 'limit' && Number(o.limit_price) > 0);

      const liveStop = stopOrder ? Number(stopOrder.stop_price) : null;
      const liveLimit = limitOrder ? Number(limitOrder.limit_price) : null;
      const dbStop = trade.stop_price != null ? Number(trade.stop_price) : null;
      const dbTarget = trade.target_price != null ? Number(trade.target_price) : null;

      const patch: Record<string, any> = {};
      const before: ReconcileResult['before'] = { qty: dbQty, stop: dbStop, target: dbTarget };
      const after: ReconcileResult['after'] = { qty: dbQty, stop: dbStop, target: dbTarget };

      let qtySynced = false;
      if (liveQty > 0 && liveQty !== dbQty) {
        patch.qty = liveQty;
        after.qty = liveQty;
        qtySynced = true;
      }

      let levelsSynced = false;
      if (liveStop != null && (dbStop == null || Math.abs(liveStop - dbStop) / Math.max(dbStop, 1) > EPS)) {
        patch.stop_price = liveStop;
        after.stop = liveStop;
        levelsSynced = true;
      }
      if (liveLimit != null && (dbTarget == null || Math.abs(liveLimit - dbTarget) / Math.max(dbTarget, 1) > EPS)) {
        patch.target_price = liveLimit;
        after.target = liveLimit;
        levelsSynced = true;
      }

      if (Object.keys(patch).length === 0) {
        results.push({ ticker: sym, action: 'in_sync' });
        continue;
      }

      patch.updated_at = new Date().toISOString();
      await supabase.from('trades').update(patch).eq('id', trade.id);

      const action: ReconcileAction = qtySynced && levelsSynced
        ? 'qty_and_levels_synced'
        : qtySynced ? 'qty_synced' : 'levels_synced';
      results.push({ ticker: sym, action, before, after });
    } catch (err: any) {
      results.push({ ticker: sym, action: 'error', detail: err?.message || String(err) });
    }
  }

  // Positions owned by OTHER mandates on the same shared broker account — don't
  // flag those as untracked (they belong to a sibling mandate, not this one).
  const otherOwned = new Set<string>();
  {
    const { data: others } = await supabase
      .from('trades')
      .select('ticker')
      .neq('mandate_id', mandateId)
      .in('status', ['open', 'submitted']);
    for (const t of others || []) otherOwned.add(String(t.ticker).toUpperCase());
  }

  // Surface broker positions we have no DB row for. Don't auto-adopt — these
  // are usually manual trades, transferred positions, or stale rows that need
  // a human call on whether to start tracking them.
  for (const [sym, pos] of posBySymbol) {
    if (trackedSymbols.has(sym)) continue;
    if (otherOwned.has(sym)) continue; // belongs to a sibling mandate
    const qty = Math.floor(Math.abs(Number(pos.qty)));
    if (qty <= 0) continue;
    results.push({
      ticker: sym,
      action: 'untracked_position',
      detail: `Alpaca holds ${qty} sh @ avg $${Number(pos.avg_entry_price).toFixed(2)} with no open trade row`,
    });
  }

  return { mandateId, results };
}
