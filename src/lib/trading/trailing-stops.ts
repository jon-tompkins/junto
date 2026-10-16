// Trailing stops for Hyperliquid mandates. When a mandate sets
// trailing_stop_pct, every open trade's stop trails its high-water mark (low-
// water for shorts) by that %, replacing the fixed stop from the proposal.
// Once the copied trader exits the position or drops off the roster, the trail
// tightens to trailing_stop_exit_pct. Stops only ever move tighter after the
// first application. The HWM comes from 15m candles since the last check, so
// spikes between ticks still count.
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import { addJournalEntry } from './db';
import type { Mandate } from './types';

const INFO = { paper: 'https://api.hyperliquid-testnet.xyz/info', live: 'https://api.hyperliquid.xyz/info' };
const ADDR_RE = /address\/(0x[0-9a-fA-F]{40})/;

export interface TrailResult { ticker: string; action: string; stop?: number; pct?: number; detail?: string }

async function info(mode: 'paper' | 'live', body: unknown): Promise<any> {
  const res = await fetch(INFO[mode], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HL info ${res.status}`);
  return res.json();
}

// Best price (high for longs, low for shorts) since `fromMs`.
async function extremeSince(mode: 'paper' | 'live', coin: string, side: string, fromMs: number): Promise<number | null> {
  const candles = await info(mode, { type: 'candleSnapshot', req: { coin, interval: '15m', startTime: fromMs, endTime: Date.now() } });
  if (!Array.isArray(candles) || !candles.length) return null;
  return side === 'long'
    ? Math.max(...candles.map((c: any) => Number(c.h)))
    : Math.min(...candles.map((c: any) => Number(c.l)));
}

// Trail %s are set on MARGIN (what the position actually loses); the price
// distance is that divided by leverage — 50% at 3x trails price by 16.7%.
export function isTrailing(mandate: Pick<Mandate, 'broker' | 'trailing_stop_pct'>): boolean {
  return mandate.broker === 'hyperliquid' && Number(mandate.trailing_stop_pct) > 0;
}
export function trailPricePct(mandate: Pick<Mandate, 'hl_max_leverage'>, marginPct: number): number {
  return marginPct / Math.max(1, Number(mandate.hl_max_leverage) || 1);
}

export function trailLevel(side: string, hwm: number, pct: number): number {
  return side === 'long' ? hwm * (1 - pct / 100) : hwm * (1 + pct / 100);
}

// Wallets this trade copied, from the entry journal's hypurrscan source links.
async function followedWallets(tradeId: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from('trade_journal_entries')
    .select('source_urls')
    .eq('trade_id', tradeId)
    .eq('kind', 'entry');
  const out = new Set<string>();
  for (const row of data || []) {
    for (const u of (row.source_urls as string[] | null) || []) {
      const m = ADDR_RE.exec(u);
      if (m) out.add(m[1].toLowerCase());
    }
  }
  return [...out];
}

// Is any followed trader still on the roster AND still holding this coin in
// the same direction (per the poller's latest snapshot)?
async function traderStillIn(juntoId: string | null, wallets: string[], coin: string, side: string): Promise<boolean> {
  if (!juntoId || !wallets.length) return true; // nothing to judge against — keep the normal trail
  const supabase = getSupabase();
  const { data: srcs } = await supabase
    .from('junto_sources')
    .select('sources!inner(handle_or_url, type)')
    .eq('junto_id', juntoId)
    .eq('sources.type', 'hyperliquid_wallet');
  const roster = new Set((srcs || []).map((r: any) => String(r.sources.handle_or_url).toLowerCase()));
  const onRoster = wallets.filter((w) => roster.has(w));
  if (!onRoster.length) return false;
  const { data: states } = await supabase.from('hl_wallet_state').select('address, positions').in('address', onRoster);
  return (states || []).some((s: any) =>
    ((s.positions as any[]) || []).some((p) => String(p.coin).toUpperCase() === coin.toUpperCase() && (side === 'long' ? p.szi > 0 : p.szi < 0)),
  );
}

export async function trailMandateStops(mandate: Mandate): Promise<TrailResult[]> {
  if (!isTrailing(mandate)) return [];
  // trail_pct on the trade row stores the PRICE distance actually applied.
  const basePct = trailPricePct(mandate, Number(mandate.trailing_stop_pct));
  const exitPct = Number(mandate.trailing_stop_exit_pct) > 0
    ? trailPricePct(mandate, Number(mandate.trailing_stop_exit_pct))
    : basePct;
  const supabase = getSupabase();
  const { data: trades } = await supabase
    .from('trades')
    .select('id, ticker, side, entry_price, entry_at, created_at, stop_price, stop_order_id, trail_hwm, trail_pct, trail_checked_at')
    .eq('mandate_id', mandate.id)
    .eq('status', 'open');
  if (!trades?.length) return [];

  const client = alpacaForMandate(mandate);
  const results: TrailResult[] = [];
  // Native HL trailing stops (exchange-side, tick-by-tick) when the driver has
  // them; the app re-places one only when the trail % changes. Falls back to
  // app-managed trailing (hourly replace of a fixed stop) if placement fails.
  const native = typeof (client as any).submitTrailingStop === 'function';
  let liveOrders: any[] = [];
  let positions: any[] = [];
  if (native) {
    [liveOrders, positions] = await Promise.all([
      info(mandate.mode, { type: 'frontendOpenOrders', user: mandate.hl_wallet_address }).catch(() => []),
      client.getPositions().catch(() => []),
    ]);
  }
  for (const t of trades) {
    try {
      const entry = Number(t.entry_price);
      if (!(entry > 0)) { results.push({ ticker: t.ticker, action: 'skip', detail: 'no entry price yet' }); continue; }
      const coin = String(t.ticker).toUpperCase();
      const from = new Date(t.trail_checked_at || t.entry_at || t.created_at).getTime();
      const extreme = await extremeSince(mandate.mode, coin, t.side, from);
      const prevHwm = t.trail_hwm != null ? Number(t.trail_hwm) : entry;
      const hwm = extreme == null ? prevHwm
        : t.side === 'long' ? Math.max(prevHwm, extreme) : Math.min(prevHwm, extreme);

      const stillIn = await traderStillIn(mandate.junto_id, await followedWallets(t.id), coin, t.side);
      const prevPct = t.trail_pct != null ? Number(t.trail_pct) : null;
      // Once tightened, stay tightened even if the trader re-enters later.
      const pct = !stillIn ? exitPct : prevPct != null && prevPct < basePct ? prevPct : basePct;
      const level = trailLevel(t.side, hwm, pct);
      const cur = t.stop_price != null ? Number(t.stop_price) : null;
      const tighter = cur == null || (t.side === 'long' ? level > cur : level < cur);
      // First application replaces the proposal's fixed stop (may widen it);
      // after that the stop only ratchets tighter.
      const move = prevPct == null || tighter;

      const patch: Record<string, any> = { trail_hwm: hwm, trail_pct: pct, trail_checked_at: new Date().toISOString() };

      if (native) {
        const coinOrders = (liveOrders as any[]).filter((o) => o.coin === coin);
        const isTrail = (o: any) => String(o.orderType || '').toLowerCase().includes('trailing');
        const current = coinOrders.find((o) => String(o.oid) === String(t.stop_order_id));
        const needPlace = prevPct == null || pct < prevPct || !current || !isTrail(current);
        const pos = (positions as any[]).find((x) => String(x.symbol).toUpperCase() === coin);
        if (needPlace && pos && Math.abs(Number(pos.qty)) > 0) {
          try {
            const oid = await (client as any).submitTrailingStop({
              symbol: coin,
              qty: Math.abs(Number(pos.qty)),
              side: t.side === 'long' ? 'sell' : 'buy',
              retracementPct: pct,
            });
            // Retire every other stop on this coin (old fixed stop / old trail).
            for (const o of coinOrders) {
              const ot = String(o.orderType || '').toLowerCase();
              if (String(o.oid) !== oid && o.reduceOnly && (ot.includes('stop') || isTrail(o)) && !ot.includes('take profit')) {
                try { await client.cancelOrder(String(o.oid)); } catch { /* best-effort */ }
              }
            }
            const mark = Number(pos.current_price) || hwm;
            patch.stop_order_id = oid;
            patch.stop_price = trailLevel(t.side, mark, pct);
            patch.trail_hwm = mark; // the exchange trails from placement
            if (prevPct != null && pct < prevPct) {
              await addJournalEntry({ tradeId: t.id, kind: 'note', content: `Copied trader exited or left the roster — native trailing stop tightened to ${Number(mandate.trailing_stop_exit_pct)}% of margin (${pct.toFixed(2)}% price, order ${oid}).` });
            }
            results.push({ ticker: coin, action: prevPct == null || !current ? 'native_trail_set' : 'native_trail_tightened', stop: patch.stop_price, pct });
            await supabase.from('trades').update(patch).eq('id', t.id);
            continue;
          } catch (e) {
            results.push({ ticker: coin, action: 'replace_failed', detail: `native trailingStop failed, app-managed fallback: ${e instanceof Error ? e.message.slice(0, 140) : e}` });
          }
        } else if (!needPlace && current) {
          if (Number(current.triggerPx) > 0) patch.stop_price = Number(current.triggerPx);
          results.push({ ticker: coin, action: 'native_trail_live', stop: patch.stop_price, pct });
          await supabase.from('trades').update(patch).eq('id', t.id);
          continue;
        }
      }

      if (move && (cur == null || Math.abs(level - cur) / cur > 0.001)) {
        patch.stop_price = level;
        if (t.stop_order_id) {
          try {
            const o = await client.replaceOrder(t.stop_order_id, { stop_price: level });
            if (o?.id) patch.stop_order_id = String(o.id);
          } catch (e) {
            // Order gone (filled/cancelled) — the protector re-attaches from stop_price.
            patch.stop_order_id = null;
            results.push({ ticker: coin, action: 'replace_failed', detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
          }
        }
        if (prevPct != null && pct < prevPct) {
          await addJournalEntry({
            tradeId: t.id,
            kind: 'note',
            content: `Copied trader exited or left the roster — trailing stop tightened to ${Number(mandate.trailing_stop_exit_pct)}% of margin (${pct.toFixed(2)}% price; stop ${level.toPrecision(6)}, best ${hwm.toPrecision(6)}).`,
          });
        }
        results.push({ ticker: coin, action: prevPct == null ? 'trail_set' : pct !== prevPct ? 'trail_tightened' : 'trail_moved', stop: level, pct });
      } else {
        results.push({ ticker: coin, action: 'unchanged', stop: cur ?? undefined, pct });
      }
      await supabase.from('trades').update(patch).eq('id', t.id);
    } catch (e) {
      results.push({ ticker: t.ticker, action: 'error', detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  }
  return results;
}
