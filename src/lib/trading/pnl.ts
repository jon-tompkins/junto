// Per-slice unrealized P/L. On a shared broker account two mandates can hold the
// same ticker, but the broker only reports ONE blended unrealized_pl per symbol.
// We instead compute each slice's P/L from its own entry fill against the shared
// mark price: (mark − entry) × qty, signed by side.
export function sliceUnrealized(side: string | null | undefined, entry: number, qty: number, mark: number): number {
  if (!entry || !qty || !mark) return 0;
  const dir = side === 'short' || side === 'sell' ? -1 : 1;
  return dir * (mark - entry) * qty;
}
