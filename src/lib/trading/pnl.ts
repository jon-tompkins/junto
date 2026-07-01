// Per-slice unrealized P/L. On a shared broker account two mandates can hold the
// same ticker, but the broker only reports ONE blended unrealized_pl per symbol.
// We instead compute each slice's P/L from its own entry fill against the shared
// mark price: (mark − entry) × qty, signed by side.
export function sliceUnrealized(side: string | null | undefined, entry: number, qty: number, mark: number): number {
  if (!entry || !qty || !mark) return 0;
  const dir = side === 'short' || side === 'sell' ? -1 : 1;
  return dir * (mark - entry) * qty;
}

// Reference (past close) prices used to compute an asset's trailing price
// performance over 24h / 1W / 1Y. The client divides the live price by these,
// so the % updates live even though the references only refresh per page load.
export interface PerfRefs {
  d1: number | null; // previous session close (~24h ago)
  w1: number | null; // close ~7 calendar days ago
  y1: number | null; // close ~365 calendar days ago
}

// Derive the three reference prices from a series of daily closes ({t: epoch ms,
// c: close}). For W/Y, take the last close on/before the cutoff; if the symbol's
// history is shorter than the window, fall back to the earliest close available.
export function perfRefsFromCloses(bars: { t: number; c: number }[], nowMs: number): PerfRefs {
  const asc = bars
    .filter((b) => Number.isFinite(b.c) && b.c > 0 && Number.isFinite(b.t))
    .sort((a, b) => a.t - b.t);
  if (!asc.length) return { d1: null, w1: null, y1: null };
  const closeOnOrBefore = (cutoff: number): number | null => {
    let ref: number | null = null;
    for (const b of asc) {
      if (b.t <= cutoff) ref = b.c;
      else break;
    }
    return ref;
  };
  const earliest = asc[0].c;
  const day = 864e5;
  return {
    d1: asc.length >= 2 ? asc[asc.length - 2].c : null,
    w1: closeOnOrBefore(nowMs - 7 * day) ?? earliest,
    y1: closeOnOrBefore(nowMs - 365 * day) ?? earliest,
  };
}
