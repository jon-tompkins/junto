// Orphan / ghost-trade sweep for Hyperliquid mandates.
//
// Failure modes this closes:
//  1. Ghost: approveTrade claims a trade (placeholder order id) and the venue
//     call dies or the DB write after it fails → trade stuck 'pending' forever.
//     If the position exists on HL we adopt it as open; if not, we reject it.
//  2. Orphan: a position on the mandate's HL wallet with no open/submitted trade
//     row (e.g. order filled but the response was lost). The wallet is
//     mandate-dedicated, so we adopt it as a tracked trade (the trailing tick
//     then attaches its stop) and alert, instead of leaving it naked.
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import { addJournalEntry, createPendingTrade, updateTrade } from './db';
import { isTrailing, trailPricePct } from './trailing-stops';
import { notifyMandate } from './autopilot';
import type { Mandate } from './types';

const GHOST_AFTER_MS = 3 * 60_000;
const REALERT_MS = 6 * 3_600_000;

export async function sweepOrphans(mandate: Mandate): Promise<string[]> {
  if (mandate.broker !== 'hyperliquid' || !mandate.hl_agent_secret) return [];
  const supabase = getSupabase();
  const notes: string[] = [];

  let positions: any[];
  try {
    positions = await alpacaForMandate(mandate).getPositions();
  } catch {
    return []; // can't see the venue → change nothing
  }
  const posByCoin = new Map<string, any>();
  for (const p of positions) if (Number(p.qty) > 0) posByCoin.set(String(p.symbol).toUpperCase(), p);

  const { data: trades } = await supabase
    .from('trades')
    .select('id, ticker, side, qty, status, alpaca_order_id, updated_at, created_at')
    .eq('mandate_id', mandate.id)
    .in('status', ['pending', 'submitted', 'open']);

  const tracked = new Set<string>();
  for (const t of trades || []) {
    const coin = String(t.ticker).toUpperCase();
    const placeholder = String(t.alpaca_order_id || '').startsWith('pending-');
    const stale = Date.now() - new Date(t.updated_at || t.created_at).getTime() > GHOST_AFTER_MS;
    if (t.status === 'pending' && placeholder && stale) {
      const pos = posByCoin.get(coin);
      if (pos && pos.side === t.side) {
        await updateTrade(t.id, {
          status: 'open',
          entry_price: Number(pos.avg_entry_price) || null,
          execution_price: Number(pos.avg_entry_price) || null,
          entry_at: new Date().toISOString(),
          qty: Number(pos.qty),
        } as any);
        await addJournalEntry({ tradeId: t.id, kind: 'note', content: '[recovered: order was claimed but never confirmed; matching position found on HL, adopted as open — trailing tick will attach the stop]' });
        tracked.add(coin);
        notes.push(`recovered ${coin}`);
        await notifyMandate(mandate, `🛠 <b>${mandate.name}</b>: recovered ${t.side.toUpperCase()} ${coin} — the order went through but wasn't confirmed. Now tracked; stop attaches next tick.`).catch(() => {});
      } else {
        await updateTrade(t.id, { status: 'rejected' });
        await addJournalEntry({ tradeId: t.id, kind: 'note', content: '[ghost trade cleared: claimed for submit but no order/position ever appeared on HL]' });
        notes.push(`cleared ghost ${coin}`);
      }
      continue;
    }
    // A fresh claimed-but-unconfirmed submit is in flight: its position is not an orphan.
    if (t.status !== 'pending' || placeholder) tracked.add(coin);
  }

  // Orphans: positions with no tracked trade.
  const alerts: Record<string, string> = { ...(((mandate as any).orphan_alerts as Record<string, string>) || {}) };
  let alertsChanged = false;
  for (const [coin, pos] of posByCoin) {
    if (tracked.has(coin)) { if (alerts[coin]) { delete alerts[coin]; alertsChanged = true; } continue; }
    const side = pos.side === 'short' ? 'short' : 'long';
    const entry = Number(pos.avg_entry_price) || Number(pos.current_price) || 0;
    if (!(entry > 0)) continue;
    const trailing = isTrailing(mandate);
    const stopPct = trailing ? trailPricePct(mandate, Number(mandate.trailing_stop_pct)) : 7;
    const stopPrice = side === 'long' ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
    const tradeId = await createPendingTrade({ mandateId: mandate.id, ticker: coin, side, qty: Number(pos.qty), stopPrice, targetPrice: null, proposalPrice: entry });
    await updateTrade(tradeId, { status: 'open', entry_price: entry, execution_price: entry, entry_at: new Date().toISOString() } as any);
    await addJournalEntry({ tradeId, kind: 'entry', content: `[adopted orphan position: ${side} ${pos.qty} ${coin} @ ${entry} found on the mandate's HL wallet with no trade row. Stop is attached by the trailing/protect tick.]` });
    notes.push(`adopted orphan ${coin}`);
    const last = alerts[coin] ? new Date(alerts[coin]).getTime() : 0;
    if (Date.now() - last > REALERT_MS) {
      alerts[coin] = new Date().toISOString();
      alertsChanged = true;
      await notifyMandate(mandate, `⚠️ <b>${mandate.name}</b>: found an untracked ${side.toUpperCase()} ${coin} position on the wallet (${pos.qty} @ ${entry}). Adopted it as a tracked trade so it gets a stop.`).catch(() => {});
    }
  }
  if (alertsChanged) await supabase.from('trading_mandates').update({ orphan_alerts: alerts }).eq('id', mandate.id);
  return notes;
}
