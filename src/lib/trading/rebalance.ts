// Aggregate-conviction rebalancer for Hyperliquid copy mandates.
//
// Entry sizes the position on the conviction we had at entry. After that, as
// more roster traders pile into the same side (or fewer / conflicting ones
// hold), we scale the position up or down proportionally:
//
//   f(state) = convictionFraction(2 + alignedWallets − conflictWallets)
//              × sqrtWeight(max(0, alignedNotional − conflictNotional))
//   target margin = baselineMargin × f(now) / f(baseline), capped at the max
//                   position and floored at 25% of baseline
//
// The baseline (margin + roster state) is recorded the first tick we see the
// trade open, so the entry itself is never resized by this module — only
// *changes* in aggregate conviction move it. Hysteresis (±25%, ≥$10 notional)
// and a per-coin rate limit keep it from churning. If nobody aligned is left,
// the existing tightened trailing stop handles the exit — we don't flatten here.
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import { addJournalEntry } from './db';
import { convictionFraction, sqrtWeight } from './autopilot';
import type { Mandate } from './types';

const BASELINE_TAG = '[rebalance-baseline]';
const RESIZE_TAG = '[rebalance]';
const HYSTERESIS = 0.25;
const MIN_ORDER_NOTIONAL = 10;
const MIN_GAP_MS = 2 * 3_600_000;
const FLOOR_OF_BASELINE = 0.25;

export interface RebalanceResult { ticker: string; action: string; detail?: string }

interface AggState { alignedN: number; conflictN: number; netNotional: number }

export function aggFraction(s: AggState, refNotional: number): number {
  const eff = Math.min(5, Math.max(1, 2 + s.alignedN - s.conflictN));
  return convictionFraction(eff) * (s.netNotional > 0 ? sqrtWeight(s.netNotional, refNotional) : 0.5);
}

async function rosterAddresses(juntoId: string): Promise<Set<string>> {
  const { data } = await getSupabase()
    .from('junto_sources')
    .select('sources!inner(handle_or_url, type)')
    .eq('junto_id', juntoId)
    .eq('sources.type', 'hyperliquid_wallet');
  const out = new Set<string>();
  for (const r of data || []) {
    const m = /(0x[0-9a-fA-F]{40})/.exec(String((r as any).sources.handle_or_url));
    if (m) out.add(m[1].toLowerCase());
  }
  return out;
}

function aggregate(states: { address: string; positions: any[] }[], roster: Set<string>, coin: string, side: string): AggState {
  let alignedN = 0, conflictN = 0, aligned = 0, conflict = 0;
  for (const s of states) {
    if (!roster.has(String(s.address).toLowerCase())) continue;
    const p = (s.positions || []).find((x) => String(x.coin).toUpperCase() === coin);
    if (!p) continue;
    const long = Number(p.szi) > 0;
    const v = Number(p.positionValue) || 0;
    if (long === (side === 'long')) { alignedN++; aligned += v; } else { conflictN++; conflict += v; }
  }
  return { alignedN, conflictN, netNotional: Math.max(0, aligned - conflict) };
}

export async function rebalanceMandate(mandate: Mandate, accountEquity: number): Promise<RebalanceResult[]> {
  if (mandate.broker !== 'hyperliquid' || !mandate.junto_id) return [];
  const supabase = getSupabase();
  const { data: trades } = await supabase
    .from('trades')
    .select('id, ticker, side, qty, entry_price, stop_order_id')
    .eq('mandate_id', mandate.id)
    .eq('status', 'open');
  if (!trades?.length) return [];

  const [roster, statesRes] = await Promise.all([
    rosterAddresses(mandate.junto_id),
    supabase.from('hl_wallet_state').select('address, positions'),
  ]);
  const states = (statesRes.data || []) as { address: string; positions: any[] }[];
  const client = alpacaForMandate(mandate);
  const positions: any[] = await client.getPositions().catch(() => []);
  const leverage = Math.max(1, Number(mandate.hl_max_leverage) || 1);
  const ref = Number(mandate.sizing_ref_notional_usd) || 1_000_000;
  const maxMargin = (accountEquity * Number(mandate.max_position_pct)) / 100;
  const out: RebalanceResult[] = [];

  for (const t of trades) {
    const coin = String(t.ticker).toUpperCase();
    try {
      const pos = positions.find((p) => String(p.symbol).toUpperCase() === coin);
      if (!pos || !(Number(pos.qty) > 0)) { out.push({ ticker: coin, action: 'skip', detail: 'no live position' }); continue; }
      const now = aggregate(states, roster, coin, t.side);

      const { data: notes } = await supabase
        .from('trade_journal_entries')
        .select('content, created_at')
        .eq('trade_id', t.id)
        .eq('kind', 'note')
        .or(`content.like.${BASELINE_TAG}%,content.like.${RESIZE_TAG}%`)
        .order('created_at', { ascending: false });
      const baselineRow = (notes || []).filter((n: any) => String(n.content).startsWith(BASELINE_TAG)).pop();
      const lastResize = (notes || []).find((n: any) => String(n.content).startsWith(RESIZE_TAG));

      const mark = Number(pos.current_price) || 0;
      const curQty = Number(pos.qty);
      if (!(mark > 0)) { out.push({ ticker: coin, action: 'skip', detail: 'no mark' }); continue; }
      const curMargin = (curQty * mark) / leverage;

      if (!baselineRow) {
        const base = { ...now, margin: curMargin };
        await addJournalEntry({ tradeId: t.id, kind: 'note', content: `${BASELINE_TAG} ${JSON.stringify(base)}` });
        out.push({ ticker: coin, action: 'baseline', detail: `aligned ${now.alignedN}, conflict ${now.conflictN}` });
        continue;
      }
      const base = JSON.parse(String(baselineRow.content).slice(BASELINE_TAG.length).trim()) as AggState & { margin: number };
      if (lastResize && Date.now() - new Date(lastResize.created_at).getTime() < MIN_GAP_MS) {
        out.push({ ticker: coin, action: 'rate_limited' }); continue;
      }
      if (now.alignedN === 0) { out.push({ ticker: coin, action: 'hold', detail: 'no aligned trader — trailing stop handles exit' }); continue; }

      const fBase = aggFraction(base, ref);
      const fNow = aggFraction(now, ref);
      if (!(fBase > 0)) continue;
      const target = Math.min(maxMargin, Math.max(base.margin * FLOOR_OF_BASELINE, (base.margin * fNow) / fBase));
      const change = (target - curMargin) / curMargin;
      const dNotional = Math.abs(target - curMargin) * leverage;
      if (Math.abs(change) < HYSTERESIS || dNotional < MIN_ORDER_NOTIONAL) {
        out.push({ ticker: coin, action: 'unchanged', detail: `target $${target.toFixed(0)} vs $${curMargin.toFixed(0)} margin` });
        continue;
      }

      const adding = target > curMargin;
      const dQty = dNotional / mark;
      const why = `aligned ${base.alignedN}→${now.alignedN}, conflicting ${base.conflictN}→${now.conflictN}, net notional $${Math.round(base.netNotional).toLocaleString()}→$${Math.round(now.netNotional).toLocaleString()}`;

      if (adding) {
        // Respect the total-exposure cap on adds.
        const maxLev = Number(mandate.max_total_leverage);
        const openNotional = positions.reduce((n, p) => n + Math.abs(Number(p.market_value) || 0), 0);
        if (maxLev > 0 && accountEquity > 0 && openNotional + dNotional > maxLev * accountEquity) {
          out.push({ ticker: coin, action: 'add_blocked', detail: 'exposure cap' }); continue;
        }
      }

      const order = await client.submitMarketOrder({
        symbol: coin,
        qty: dQty,
        side: (t.side === 'long') === adding ? 'buy' : 'sell',
        reduceOnly: !adding,
      });
      if (!(Number(order.filled_qty) > 0)) { out.push({ ticker: coin, action: 'unfilled', detail: String(order.status) }); continue; }

      // Sync the trade row to the live position. Adds need the stop re-placed
      // at the larger qty (null id → trailing pass re-places the native trail);
      // reduce-only stops clamp to the smaller position by themselves.
      const after: any[] = await client.getPositions().catch(() => []);
      const np = after.find((p) => String(p.symbol).toUpperCase() === coin);
      const patch: Record<string, any> = {};
      if (np) { patch.qty = Number(np.qty); patch.entry_price = Number(np.avg_entry_price) || t.entry_price; }
      if (adding) patch.stop_order_id = null;
      if (Object.keys(patch).length) await supabase.from('trades').update(patch).eq('id', t.id);

      await addJournalEntry({
        tradeId: t.id,
        kind: 'note',
        content: `${RESIZE_TAG} ${adding ? 'Scaled UP' : 'Scaled DOWN'} ${coin} margin $${curMargin.toFixed(0)} → ~$${target.toFixed(0)} (${why}); filled ${Number(order.filled_qty)} @ ${order.filled_avg_price ?? 'n/a'}.`,
      });
      out.push({ ticker: coin, action: adding ? 'scaled_up' : 'scaled_down', detail: why });
    } catch (e) {
      out.push({ ticker: coin, action: 'error', detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  }
  return out;
}
