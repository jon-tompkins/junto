// Realized P&L for a followed Hyperliquid wallet, rebuilt from its fills.
//
// "Net new" = P&L from position lifecycles that OPENED after we started
// following the wallet. Positions it already held when we added it are
// excluded (their closes would be credit/blame for trades we never could copy).
// A lifecycle runs from a fill that takes a coin from flat → non-flat until the
// fill that returns it to flat (or flips sign, which starts a new lifecycle).
// Fees are netted. Hyperliquid only serves the most recent ~10k fills, so very
// active wallets have a shorter visible window (reported as `coveredFromMs`).

const HL_INFO = 'https://api.hyperliquid.xyz/info';

export interface HlFill {
  coin: string; px: string; sz: string; side: string; time: number;
  startPosition: string; dir: string; closedPnl: string; fee: string; hash?: string; tid?: number;
}

export async function fetchFills(address: string, startMs: number, maxPages = 6): Promise<HlFill[]> {
  const out: HlFill[] = [];
  let from = startMs;
  for (let i = 0; i < maxPages; i++) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      res = await fetch(HL_INFO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'userFillsByTime', user: address, startTime: from, aggregateByTime: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); // HL info is rate-limited per IP
    }
    if (!res || !res.ok) throw new Error(`HL fills ${res?.status}`);
    const page = (await res.json()) as HlFill[];
    if (!page.length) break;
    out.push(...page);
    await new Promise((r) => setTimeout(r, 600));
    if (page.length < 2000) break;
    from = page[page.length - 1].time + 1;
  }
  const seen = new Set<string>();
  return out.filter((f) => { const k = `${f.hash}-${f.tid}-${f.time}-${f.sz}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.time - b.time);
}

export interface WalletPnl {
  coveredFromMs: number | null;
  /** all realized P&L (net of fees) in [from, to) — used for before/after windows */
  windowPnl: (fromMs: number, toMs: number) => number;
  netNewPnl: number; netNewTrades: number; netNewWins: number;
  /** lifecycles that were already open at includedMs (ignored) */
  inheritedClosed: number;
}

export function analyzeFills(fills: HlFill[], includedMs: number): WalletPnl {
  const pos = new Map<string, number>();         // coin → signed size
  const lifeStart = new Map<string, number>();   // coin → lifecycle open time
  const lifePnl = new Map<string, number>();
  let netNewPnl = 0, netNewTrades = 0, netNewWins = 0, inheritedClosed = 0;

  for (const f of fills) {
    const sz = Number(f.sz), signed = f.side === 'B' ? sz : -sz;
    const before = pos.has(f.coin) ? pos.get(f.coin)! : Number(f.startPosition) || 0;
    const after = before + signed;
    const net = (Number(f.closedPnl) || 0) - (Number(f.fee) || 0);
    if (Math.abs(before) < 1e-9 && !lifeStart.has(f.coin)) { lifeStart.set(f.coin, f.time); lifePnl.set(f.coin, 0); }
    if (!lifeStart.has(f.coin)) { lifeStart.set(f.coin, -1); lifePnl.set(f.coin, 0); } // opened before our window
    lifePnl.set(f.coin, (lifePnl.get(f.coin) || 0) + net);
    const flat = Math.abs(after) < 1e-9;
    const flipped = !flat && Math.sign(after) !== Math.sign(before) && Math.abs(before) > 1e-9;
    if (flat || flipped) {
      const start = lifeStart.get(f.coin)!;
      const p = lifePnl.get(f.coin) || 0;
      if (start >= includedMs) { netNewPnl += p; netNewTrades++; if (p > 0) netNewWins++; } else inheritedClosed++;
      lifeStart.delete(f.coin); lifePnl.delete(f.coin);
      if (flipped) { lifeStart.set(f.coin, f.time); lifePnl.set(f.coin, 0); }
    }
    pos.set(f.coin, after);
  }
  // still-open lifecycles opened after inclusion: count their realized-so-far as net new too
  for (const [coin, start] of lifeStart) {
    if (start >= includedMs) netNewPnl += lifePnl.get(coin) || 0;
  }
  return {
    coveredFromMs: fills.length ? fills[0].time : null,
    windowPnl: (a, b) => fills.filter((f) => f.time >= a && f.time < b).reduce((s, f) => s + (Number(f.closedPnl) || 0) - (Number(f.fee) || 0), 0),
    netNewPnl, netNewTrades, netNewWins, inheritedClosed,
  };
}
