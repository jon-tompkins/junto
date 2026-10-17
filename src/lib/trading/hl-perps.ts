// Perps snapshot for a Hyperliquid wallet: collateral, margin, leverage,
// liquidation and the live (trailing) stop per position, from HL's public info
// API. Used by the mandate page's perps panel and the Telegram /positions view.
export async function hlPerps(user: string, mode: string) {
  const url = mode === 'live' ? 'https://api.hyperliquid.xyz/info' : 'https://api.hyperliquid-testnet.xyz/info';
  const info = async (body: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    if (!r.ok) throw new Error(`HL ${r.status}`);
    return r.json();
  };
  const [state, spot, orders] = await Promise.all([
    info({ type: 'clearinghouseState', user }),
    info({ type: 'spotClearinghouseState', user }).catch(() => ({ balances: [] })),
    info({ type: 'frontendOpenOrders', user }).catch(() => []),
  ]);
  // Free spot USDC only — `hold` is margin already counted in perp accountValue.
  const spotUsdc = (spot.balances || []).filter((b: any) => b.coin === 'USDC').reduce((n: number, b: any) => n + Math.max(0, Number(b.total || 0) - Number(b.hold || 0)), 0);
  const ms = state.marginSummary || {};
  const perpValue = Number(ms.accountValue) || 0;
  // Unified account: spot USDC backs perps margin, so collateral = perp + spot.
  const collateral = perpValue + spotUsdc;
  const notional = Number(ms.totalNtlPos) || 0;
  const marginUsed = Number(ms.totalMarginUsed) || 0;
  const stops = new Map<string, { trigger: number; trailing: boolean; detail: string }>();
  for (const o of orders as any[]) {
    const ot = String(o.orderType || '').toLowerCase();
    if (!o.reduceOnly || !ot.includes('stop') || ot.includes('take profit')) continue;
    stops.set(o.coin, { trigger: Number(o.triggerPx) || 0, trailing: ot.includes('trailing'), detail: String(o.triggerCondition || '') });
  }
  const positions = (state.assetPositions || []).map((ap: any) => {
    const p = ap.position;
    const szi = Number(p.szi) || 0;
    const value = Number(p.positionValue) || 0;
    const mark = szi ? value / Math.abs(szi) : 0;
    const liq = p.liquidationPx != null ? Number(p.liquidationPx) : null;
    const stop = stops.get(p.coin) || null;
    const away = (px: number | null) => (px && mark ? Math.abs(px - mark) / mark * 100 : null);
    return {
      coin: String(p.coin),
      side: szi >= 0 ? 'long' : 'short',
      size: Math.abs(szi),
      value,
      entry: p.entryPx != null ? Number(p.entryPx) : null,
      mark,
      leverage: Number(p.leverage?.value) || 0,
      leverage_type: String(p.leverage?.type || ''),
      margin_used: Number(p.marginUsed) || 0,
      unrealized_pnl: Number(p.unrealizedPnl) || 0,
      roe_pct: (Number(p.returnOnEquity) || 0) * 100,
      funding_since_open: -(Number(p.cumFunding?.sinceOpen) || 0), // HL reports paid funding as positive
      liq_px: liq,
      liq_away_pct: away(liq),
      stop_px: stop?.trigger ?? null,
      stop_away_pct: away(stop?.trigger ?? null),
      stop_trailing: !!stop?.trailing,
      stop_detail: stop?.detail ?? null,
    };
  });
  return {
    collateral,
    perp_value: perpValue,
    spot_usdc: spotUsdc,
    notional,
    margin_used: marginUsed,
    free_collateral: Math.max(0, collateral - marginUsed),
    effective_leverage: collateral > 0 ? notional / collateral : 0,
    maintenance_margin: Number(state.crossMaintenanceMarginUsed) || 0,
    positions,
  };
}

export type HlPerps = Awaited<ReturnType<typeof hlPerps>>;
