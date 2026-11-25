import { getSupabase } from '@/lib/db/client';
import { logSignal } from './db';
import { rosterAddresses } from './rebalance';
import type { Mandate, ExtractedSignal } from './types';

// Catch-up entries (HL copy mandates). Entries are normally event-driven (a roster
// trader opens/adds), so if we are flat on a coin the roster is STILL heavily
// positioned in — we were stopped out, closed early, or an event was consumed
// while we held the opposite side — nothing ever brings us back in. This pass
// turns strong, current roster consensus into ordinary signals, which then go
// through the same decide step, entry gates (cooldown, chase check, caps) and
// sizing as any other signal.
//
// Deliberately conservative: conviction capped at 4, needs 2+ aligned traders
// that outnumber the other side by 2+ and 2x its notional, coins we already
// hold are never touched, and each coin is tried at most once per cooldown.
// Every candidate is logged with the '[catch-up' prefix so its value can be
// measured separately from event-driven entries.
export const CATCH_UP_MIN_ALIGNED = 2;
export const CATCH_UP_MIN_LEAD = 2;
export const CATCH_UP_NOTIONAL_RATIO = 2;
export const CATCH_UP_MAX_CONVICTION = 4;
export const CATCH_UP_COOLDOWN_HOURS = 12;
export const CATCH_UP_MAX_PER_TICK = 3;
export const CATCH_UP_TAG = '[catch-up]';

export async function loadCatchUpSignals(mandate: Mandate, ownTickers: Set<string>): Promise<ExtractedSignal[]> {
  if (mandate.broker !== 'hyperliquid' || !mandate.junto_id || mandate.execution_mode !== 'full_auto') return [];
  const sb = getSupabase();
  const [roster, statesRes] = await Promise.all([
    rosterAddresses(mandate.junto_id),
    sb.from('hl_wallet_state').select('address, positions, updated_at'),
  ]);
  const staleBefore = Date.now() - 2 * 3_600_000;
  const per = new Map<string, { l: number; s: number; ln: number; sn: number }>();
  for (const st of (statesRes.data || []) as any[]) {
    if (!roster.has(String(st.address).toLowerCase())) continue;
    if (st.updated_at && Date.parse(st.updated_at) < staleBefore) continue; // stale snapshot
    for (const p of st.positions || []) {
      const coin = String(p.coin).toUpperCase();
      const a = per.get(coin) || { l: 0, s: 0, ln: 0, sn: 0 };
      const v = Number(p.positionValue) || 0;
      if (Number(p.szi) > 0) { a.l++; a.ln += v; } else { a.s++; a.sn += v; }
      per.set(coin, a);
    }
  }

  const since = new Date(Date.now() - CATCH_UP_COOLDOWN_HOURS * 3_600_000).toISOString();
  const { data: recent } = await sb.from('trading_signals').select('ticker')
    .eq('mandate_id', mandate.id).gte('tick_at', since).like('rationale', `${CATCH_UP_TAG}%`);
  const cooling = new Set((recent || []).map((r: any) => String(r.ticker).toUpperCase()));

  const cands: Array<{ coin: string; side: 'long' | 'short'; n: number; other: number; notional: number; otherNotional: number }> = [];
  for (const [coin, a] of per) {
    if (ownTickers.has(coin) || cooling.has(coin)) continue;
    const long = a.l >= a.s;
    const n = long ? a.l : a.s, other = long ? a.s : a.l;
    const notional = long ? a.ln : a.sn, otherNotional = long ? a.sn : a.ln;
    if (n < CATCH_UP_MIN_ALIGNED || n - other < CATCH_UP_MIN_LEAD) continue;
    if (notional < CATCH_UP_NOTIONAL_RATIO * otherNotional) continue;
    cands.push({ coin, side: long ? 'long' : 'short', n, other, notional, otherNotional });
  }
  cands.sort((x, y) => y.notional - x.notional);

  const signals: ExtractedSignal[] = [];
  for (const c of cands.slice(0, CATCH_UP_MAX_PER_TICK)) {
    const sig: ExtractedSignal = {
      ticker: c.coin,
      direction: c.side,
      conviction: Math.min(CATCH_UP_MAX_CONVICTION, Math.max(3, 2 + c.n - c.other)) as 3 | 4,
      rationale: `${CATCH_UP_TAG} roster is ${c.n} ${c.side} vs ${c.other} opposite on ${c.coin} ($${(c.notional / 1e6).toFixed(1)}M vs $${(c.otherNotional / 1e6).toFixed(1)}M); we are flat — consensus entry`,
      source_urls: [],
    };
    signals.push(sig);
    await logSignal({ mandateId: mandate.id, signal: sig, decision: 'skipped_guideline', decisionReason: 'catch-up candidate (sent to decide; see later rows for outcome)' }).catch(() => {});
  }
  return signals;
}
