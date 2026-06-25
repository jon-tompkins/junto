// Hyperliquid wallet-as-a-source: read a tracked wallet's live perp positions
// and diff them against the last snapshot to surface position-change events
// (opened / closed / increased / decreased / flipped). Read-only — the public
// `info` endpoint needs no signing. These events are the structured signal that
// will later feed the trade engine (approval-gated), mirroring the tweet path.

const HL_INFO = 'https://api.hyperliquid.xyz/info';

export interface WalletPosition {
  coin: string;
  szi: number;            // signed size: >0 long, <0 short
  side: 'long' | 'short';
  leverage: number;
  entryPx: number | null;
  positionValue: number;
  unrealizedPnl: number;
}

export interface WalletState {
  accountValue: number;
  positions: WalletPosition[];
}

export type WalletEventKind = 'opened' | 'closed' | 'increased' | 'decreased' | 'flipped';

export interface WalletEvent {
  coin: string;
  kind: WalletEventKind;
  side: 'long' | 'short' | null; // resulting side
  prevSzi: number;
  newSzi: number;
  leverage: number;
  positionValue: number;
  pctOfAccount: number;          // resulting position value as % of account
}

export async function getWalletState(address: string): Promise<WalletState> {
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: address }),
  });
  if (!res.ok) {
    throw new Error(`Hyperliquid clearinghouseState ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data: any = await res.json();
  const accountValue = Number(data?.marginSummary?.accountValue) || 0;
  const positions: WalletPosition[] = (data?.assetPositions || []).map((ap: any) => {
    const p = ap.position;
    const szi = Number(p.szi) || 0;
    return {
      coin: String(p.coin),
      szi,
      side: szi >= 0 ? 'long' : 'short',
      leverage: Number(p?.leverage?.value) || 0,
      entryPx: p.entryPx != null ? Number(p.entryPx) : null,
      positionValue: Number(p.positionValue) || 0,
      unrealizedPnl: Number(p.unrealizedPnl) || 0,
    };
  });
  return { accountValue, positions };
}

// Compare a previous snapshot to the current one and emit change events. Resize
// events fire only above a relative threshold so normal mark-to-market noise
// doesn't spam; opens / closes / direction flips always fire.
export function diffWalletPositions(
  prev: WalletPosition[],
  next: WalletState,
  resizeThreshold = 0.15,
): WalletEvent[] {
  const prevByCoin = new Map(prev.map((p) => [p.coin, p]));
  const nextByCoin = new Map(next.positions.map((p) => [p.coin, p]));
  const av = next.accountValue || 0;
  const events: WalletEvent[] = [];

  const pct = (posVal: number) => (av > 0 ? (posVal / av) * 100 : 0);

  for (const [coin, np] of nextByCoin) {
    const pp = prevByCoin.get(coin);
    if (!pp || pp.szi === 0) {
      events.push({ coin, kind: 'opened', side: np.side, prevSzi: pp?.szi ?? 0, newSzi: np.szi, leverage: np.leverage, positionValue: np.positionValue, pctOfAccount: pct(np.positionValue) });
      continue;
    }
    const flipped = Math.sign(pp.szi) !== Math.sign(np.szi);
    if (flipped) {
      events.push({ coin, kind: 'flipped', side: np.side, prevSzi: pp.szi, newSzi: np.szi, leverage: np.leverage, positionValue: np.positionValue, pctOfAccount: pct(np.positionValue) });
      continue;
    }
    const absPrev = Math.abs(pp.szi);
    const absNext = Math.abs(np.szi);
    if (absPrev > 0) {
      const rel = (absNext - absPrev) / absPrev;
      if (rel > resizeThreshold) {
        events.push({ coin, kind: 'increased', side: np.side, prevSzi: pp.szi, newSzi: np.szi, leverage: np.leverage, positionValue: np.positionValue, pctOfAccount: pct(np.positionValue) });
      } else if (rel < -resizeThreshold) {
        events.push({ coin, kind: 'decreased', side: np.side, prevSzi: pp.szi, newSzi: np.szi, leverage: np.leverage, positionValue: np.positionValue, pctOfAccount: pct(np.positionValue) });
      }
    }
  }

  // Closed: in prev (non-zero) but gone/zero in next.
  for (const [coin, pp] of prevByCoin) {
    if (pp.szi === 0) continue;
    const np = nextByCoin.get(coin);
    if (!np || np.szi === 0) {
      events.push({ coin, kind: 'closed', side: null, prevSzi: pp.szi, newSzi: 0, leverage: pp.leverage, positionValue: 0, pctOfAccount: 0 });
    }
  }

  return events;
}
