import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { ROSTER_JUNTO_ID } from '@/lib/trading/hl-roster';

// Public: the dynamic HL Top Traders roster — live positions + 30d PnL curve per
// wallet, straight from Hyperliquid's public info API. Cached 5 min at the edge.
export const revalidate = 300;
export const maxDuration = 60;

const HL_INFO = 'https://api.hyperliquid.xyz/info';

async function info(body: unknown): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(HL_INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt >= 3) throw new Error(`HL info ${res.status}`);
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
  }
}

export interface TopTraderPosition { coin: string; side: 'long' | 'short'; value: number; pctOfAccount: number; leverage: number; roePct: number; entryPx: number | null }
export interface TopTrader {
  address: string; rank: number;
  accountUsd: number;
  weekPnl: number | null; monthPnl: number | null; weekRoi: number | null; monthRoi: number | null;
  medianHoldHours: number | null;
  pnlHistory: Array<[number, number]>; // 30d cumulative PnL
  positions: TopTraderPosition[];
}

export async function GET() {
  const { data: rows } = await getSupabase()
    .from('junto_sources')
    .select('sources!inner(handle_or_url, type, metadata, display_name)')
    .eq('junto_id', ROSTER_JUNTO_ID)
    .eq('sources.type', 'hyperliquid_wallet');

  const traders: TopTrader[] = [];
  for (const r of (rows || []) as any[]) {
    const address = String(r.sources.handle_or_url).toLowerCase();
    const meta = r.sources.metadata || {};
    try {
      const [state, spot, portfolio] = await Promise.all([
        info({ type: 'clearinghouseState', user: address }),
        info({ type: 'spotClearinghouseState', user: address }).catch(() => ({ balances: [] })),
        info({ type: 'portfolio', user: address }).catch(() => []),
      ]);
      const spotUsdc = (spot.balances || []).filter((b: any) => b.coin === 'USDC').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
      const accountUsd = Number(state?.marginSummary?.accountValue || 0) + spotUsdc;
      const windows = Object.fromEntries(Array.isArray(portfolio) ? portfolio : []);
      const month = windows.month || {};
      const week = windows.week || {};
      const lastPnl = (w: any) => { const h = w.pnlHistory || []; return h.length ? Number(h[h.length - 1][1]) : null; };
      const positions: TopTraderPosition[] = (state?.assetPositions || []).map((ap: any) => {
        const p = ap.position; const szi = Number(p.szi); const value = Number(p.positionValue) || 0;
        return {
          coin: String(p.coin), side: szi >= 0 ? 'long' : 'short', value,
          pctOfAccount: accountUsd > 0 ? (value / accountUsd) * 100 : 0,
          leverage: Number(p.leverage?.value) || 0,
          roePct: Number(p.returnOnEquity) * 100 || 0,
          entryPx: p.entryPx != null ? Number(p.entryPx) : null,
        };
      }).sort((a: TopTraderPosition, b: TopTraderPosition) => b.value - a.value);
      traders.push({
        address, rank: Number(meta.rank) || Number(/#(\d+)/.exec(r.sources.display_name || '')?.[1]) || 99, accountUsd,
        weekPnl: lastPnl(week) ?? (meta.week_pnl ?? null),
        monthPnl: lastPnl(month) ?? (meta.month_pnl ?? null),
        weekRoi: meta.week_roi ?? null, monthRoi: meta.month_roi ?? null,
        medianHoldHours: meta.median_hold_hours ?? null,
        pnlHistory: (month.pnlHistory || []).map((x: any) => [Number(x[0]), Number(x[1])] as [number, number]),
        positions,
      });
    } catch {
      // skip a wallet HL won't serve right now; the rest of the board still renders
    }
  }
  traders.sort((a, b) => a.rank - b.rank);
  return NextResponse.json({ updatedAt: new Date().toISOString(), traders });
}
