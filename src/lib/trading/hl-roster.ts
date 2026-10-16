// Dynamic Hyperliquid copy-trade roster: pick the top-N wallets by trailing
// 7d + 30d performance from HL's public leaderboard, filtered down to traders a
// copier can actually follow, and sync them into a wallet junto. The existing
// pipeline (hl-wallet-poll → hl_wallet_events → extract-wallets → decide) then
// turns their position changes into trade proposals.
//
// Filters (raw leaderboard top-10 is mostly uncopyable):
//  - account size floor; positive 7d AND 30d PnL; minimum weekly volume
//  - ROI sanity caps (deposit / base-balance artifacts show 1000%+ ROI)
//  - market makers / HFT out: weekly turnover cap, fills-per-day cap, and
//    near-all-maker fill flow combined with short holds
//  - median holding time of hours (round trips reconstructed from fills)
//  - traded in the last 7 days (no signals from dormant wallets)
// Ranking = rank-average of 7d ROI, 7d PnL, 30d ROI, 30d PnL (ROI alone favours
// tiny gamblers, PnL alone favours whales). Incumbents get hysteresis so the
// roster doesn't churn on noise.
import { getSupabase } from '@/lib/db/client';

// Private junto "HL Top Traders (dynamic)" whose wallet sources this roster owns.
export const ROSTER_JUNTO_ID = '41a6f20f-c271-443d-a778-6670622c70a7';

const LEADERBOARD = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const HL_INFO = 'https://api.hyperliquid.xyz/info';

export const ROSTER_DEFAULTS = {
  size: 10,
  minAccountUsd: 200_000,
  minWeekVolumeUsd: 2_000_000,
  maxWeekTurnover: 60,      // weekly volume / account value
  maxWeekRoi: 3,            // 300%
  maxMonthRoi: 5,           // 500%
  minMedianHoldHours: 2,
  maxFillsPerDay: 150,
  mmMakerRatio: 0.9,        // ≥90% maker fills AND holds < mmHoldHours = MM
  mmHoldHours: 6,
  deepCheck: 50,            // how many top-scored candidates get the fills check
  keepIncumbentWithinRank: 20,
};
export type RosterOpts = typeof ROSTER_DEFAULTS;

export interface RosterEntry {
  address: string;
  label: string;
  rank: number;
  score: number;
  accountUsd: number;
  weekPnl: number; weekRoi: number;
  monthPnl: number; monthRoi: number;
  weekVolume: number; turnover: number;
  fillsPerDay: number; makerRatio: number;
  roundTrips: number; medianHoldHours: number | null;
  openPositions: number;
  incumbent: boolean;
}

export interface RosterRejection { address: string; reason: string }

async function info(body: unknown): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(HL_INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt >= 4) throw new Error(`HL info ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

// userFillsByTime returns at most 2000 fills from startTime forward, so page
// until we reach now. Still capped after maxPages = trades too often to copy.
async function fillsSince(user: string, startTime: number, maxPages = 5): Promise<{ fills: any[]; capped: boolean }> {
  const fills: any[] = [];
  let from = startTime;
  for (let page = 0; page < maxPages; page++) {
    const batch = await info({ type: 'userFillsByTime', user, startTime: from, aggregateByTime: true });
    if (!Array.isArray(batch) || !batch.length) return { fills, capped: false };
    fills.push(...batch);
    if (batch.length < 2000) return { fills, capped: false };
    from = Math.max(...batch.map((f: any) => f.time)) + 1;
  }
  return { fills, capped: true };
}

function windowPerf(row: any, key: string) {
  const w = Object.fromEntries(row.windowPerformances || [])[key] || {};
  return { pnl: Number(w.pnl) || 0, roi: Number(w.roi) || 0, vlm: Number(w.vlm) || 0 };
}

// Rank-average: each metric ranked descending (1 = best), averaged; lower = better.
function rankAverage<T>(items: T[], metrics: Array<(t: T) => number>): Map<T, number> {
  const sums = new Map<T, number>(items.map((t) => [t, 0]));
  for (const m of metrics) {
    [...items].sort((a, b) => m(b) - m(a)).forEach((t, i) => sums.set(t, sums.get(t)! + i + 1));
  }
  return new Map([...sums].map(([t, s]) => [t, s / metrics.length]));
}

// Round trips from fills: a position opened from flat and later returned to flat
// (or flipped). Fills carry startPosition, so no full history is needed.
function fillStats(fills: any[], now: number, capped: boolean) {
  const n = fills.length;
  const first = n ? Math.min(...fills.map((f) => f.time)) : now;
  const spanDays = Math.max((now - first) / 86_400_000, 1);
  const maker = n ? fills.filter((f) => !f.crossed).length / n : 0;
  const opens = new Map<string, number>();
  const holds: number[] = [];
  for (const f of [...fills].sort((a, b) => a.time - b.time)) {
    const start = Number(f.startPosition);
    const end = start + Number(f.sz) * (f.side === 'B' ? 1 : -1);
    const flat = (x: number) => Math.abs(x) < 1e-9 * Math.max(1, Math.abs(start));
    if (flat(start) && !flat(end)) opens.set(f.coin, f.time);
    else if (flat(end) || start * end < 0) {
      const t0 = opens.get(f.coin);
      if (t0 != null) holds.push((f.time - t0) / 3_600_000);
      opens.delete(f.coin);
      if (start * end < 0) opens.set(f.coin, f.time);
    }
  }
  holds.sort((a, b) => a - b);
  const median = holds.length ? holds[Math.floor(holds.length / 2)] : null;
  const lastFill = n ? Math.max(...fills.map((f) => f.time)) : 0;
  return { n, fillsPerDay: capped ? Infinity : n / spanDays, maker, roundTrips: holds.length, median, lastFill };
}

export async function computeRoster(
  incumbents: string[] = [],
  overrides: Partial<RosterOpts> = {},
): Promise<{ roster: RosterEntry[]; considered: number; prefiltered: number; rejected: RosterRejection[] }> {
  const o = { ...ROSTER_DEFAULTS, ...overrides };
  const res = await fetch(LEADERBOARD, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HL leaderboard ${res.status}`);
  const rows: any[] = (await res.json())?.leaderboardRows || [];

  type C = Omit<RosterEntry, 'label' | 'rank' | 'score' | 'fillsPerDay' | 'makerRatio' | 'roundTrips' | 'medianHoldHours' | 'openPositions' | 'incumbent'>;
  const cands: C[] = [];
  for (const r of rows) {
    const accountUsd = Number(r.accountValue) || 0;
    const w = windowPerf(r, 'week');
    const m = windowPerf(r, 'month');
    if (accountUsd < o.minAccountUsd || w.pnl <= 0 || m.pnl <= 0) continue;
    if (w.vlm < o.minWeekVolumeUsd || w.vlm / accountUsd > o.maxWeekTurnover) continue;
    if (w.roi > o.maxWeekRoi || m.roi > o.maxMonthRoi) continue;
    cands.push({
      address: String(r.ethAddress).toLowerCase(), accountUsd,
      weekPnl: w.pnl, weekRoi: w.roi, monthPnl: m.pnl, monthRoi: m.roi,
      weekVolume: w.vlm, turnover: w.vlm / accountUsd,
    });
  }
  const scores = rankAverage(cands, [(c) => c.weekRoi, (c) => c.weekPnl, (c) => c.monthRoi, (c) => c.monthPnl]);
  cands.sort((a, b) => scores.get(a)! - scores.get(b)!);

  const inc = new Set(incumbents.map((a) => a.toLowerCase()));
  const now = Date.now();
  const passed: RosterEntry[] = [];
  const rejected: RosterRejection[] = [];
  const toCheck = cands.slice(0, o.deepCheck);
  // Incumbents still passing the cheap filters get re-checked even if they
  // slipped below the deep-check cut, so hysteresis can apply.
  for (const c of cands.slice(o.deepCheck)) if (inc.has(c.address)) toCheck.push(c);

  for (const c of toCheck) {
    if (passed.length >= o.size + 10 && !inc.has(c.address)) break;
    try {
      const { fills, capped } = await fillsSince(c.address, now - 30 * 86_400_000);
      const s = fillStats(fills, now, capped);
      const reject = (reason: string) => rejected.push({ address: c.address, reason });
      if (s.fillsPerDay > o.maxFillsPerDay) { reject(`hft: ${s.fillsPerDay === Infinity ? '10k+ fills in 30d' : s.fillsPerDay.toFixed(0) + ' fills/day'}`); continue; }
      if (s.lastFill < now - 7 * 86_400_000) { reject('no trades in 7d'); continue; }
      if (s.median != null && s.median < o.minMedianHoldHours) { reject(`median hold ${s.median.toFixed(1)}h`); continue; }
      if (s.maker >= o.mmMakerRatio && (s.median == null || s.median < o.mmHoldHours)) { reject(`market maker (maker ${Math.round(s.maker * 100)}%)`); continue; }
      const st = await info({ type: 'clearinghouseState', user: c.address });
      // no completed trip in the window — only keep if they hold positions now
      if (s.roundTrips === 0 && !(st?.assetPositions || []).length) { reject('no round trips, no positions'); continue; }
      passed.push({
        ...c, label: '', rank: 0, score: scores.get(c)!,
        fillsPerDay: Number(s.fillsPerDay.toFixed(1)), makerRatio: Number(s.maker.toFixed(2)),
        roundTrips: s.roundTrips, medianHoldHours: s.median != null ? Number(s.median.toFixed(1)) : null,
        openPositions: (st?.assetPositions || []).length, incumbent: inc.has(c.address),
      });
    } catch (e) {
      rejected.push({ address: c.address, reason: `fetch error: ${e instanceof Error ? e.message : e}` });
    }
  }

  passed.sort((a, b) => a.score - b.score);
  passed.forEach((p, i) => { p.rank = i + 1; });
  // Hysteresis: incumbents within keepIncumbentWithinRank keep their seat; fill
  // the rest with the best newcomers.
  const keep = passed.filter((p) => p.incumbent && p.rank <= o.keepIncumbentWithinRank).slice(0, o.size);
  const fresh = passed.filter((p) => !keep.includes(p)).slice(0, o.size - keep.length);
  const roster = [...keep, ...fresh].sort((a, b) => a.rank - b.rank);
  roster.forEach((p) => { p.label = `HL Top #${p.rank} ${p.address.slice(0, 8)}`; });
  return { roster, considered: rows.length, prefiltered: cands.length, rejected };
}

// Make the junto's hyperliquid_wallet sources exactly the roster and keep
// hl_tracked_wallets (what the poller reads) in step. Wallets that drop off are
// unlinked from this junto and stop being polled unless another junto uses them.
export async function syncRosterToJunto(juntoId: string, roster: RosterEntry[]) {
  const supabase = getSupabase();
  const want = new Map(roster.map((r) => [r.address, r]));

  const { data: linked } = await supabase
    .from('junto_sources')
    .select('id, source_id, sources!inner(id, handle_or_url, type)')
    .eq('junto_id', juntoId)
    .eq('sources.type', 'hyperliquid_wallet');
  const current = new Map<string, { linkId: string; sourceId: string }>(
    (linked || []).map((l: any) => [String(l.sources.handle_or_url).toLowerCase(), { linkId: l.id, sourceId: l.source_id }]),
  );

  const added: string[] = [];
  const removed: string[] = [];
  for (const [addr, r] of want) {
    let sourceId = current.get(addr)?.sourceId;
    if (!sourceId) {
      const { data: existing } = await supabase.from('sources').select('id').eq('type', 'hyperliquid_wallet').ilike('handle_or_url', addr).maybeSingle();
      sourceId = existing?.id;
      if (!sourceId) {
        const { data: ins, error } = await supabase.from('sources')
          .insert({ type: 'hyperliquid_wallet', handle_or_url: addr, display_name: r.label, is_active: true, is_tracked: false, metadata: { roster: true } })
          .select('id').single();
        if (error) throw new Error(`source insert ${addr}: ${error.message}`);
        sourceId = ins.id;
      }
      const { error: linkErr } = await supabase.from('junto_sources').insert({ junto_id: juntoId, source_id: sourceId });
      if (linkErr) throw new Error(`junto link ${addr}: ${linkErr.message}`);
      added.push(addr);
    }
    await supabase.from('sources').update({ display_name: r.label, updated_at: new Date().toISOString() }).eq('id', sourceId);
    await supabase.from('hl_tracked_wallets').upsert({ address: addr, label: r.label, is_active: true });
  }

  for (const [addr, cur] of current) {
    if (want.has(addr)) continue;
    await supabase.from('junto_sources').delete().eq('id', cur.linkId);
    removed.push(addr);
    // still followed by some other wallet junto? keep polling it.
    const { data: other } = await supabase.from('junto_sources').select('id').eq('source_id', cur.sourceId).limit(1);
    if (!other?.length) await supabase.from('hl_tracked_wallets').update({ is_active: false }).eq('address', addr);
  }
  return { added, removed };
}

export async function currentRoster(juntoId: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from('junto_sources')
    .select('sources!inner(handle_or_url, type)')
    .eq('junto_id', juntoId)
    .eq('sources.type', 'hyperliquid_wallet');
  return (data || []).map((r: any) => String(r.sources.handle_or_url).toLowerCase());
}
