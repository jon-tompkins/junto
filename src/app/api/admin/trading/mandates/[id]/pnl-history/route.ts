import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

type Series = Array<[number, number]>; // [ms, cumulative P/L usd], starts at 0
const RANGES = ['1D', '7D', '30D', 'All'] as const;
const RANGE_MS: Record<string, number> = { '1D': 864e5, '7D': 7 * 864e5, '30D': 30 * 864e5 };

// Cumulative P/L curve for the mandate page chart, per range.
// Hyperliquid: the wallet's perp PnL history (realized + unrealized, net of
// fees/funding; deposits excluded). Others: cumulative realized P/L of closed trades.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate: any = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (mandate.broker === 'hyperliquid' && mandate.hl_wallet_address) {
    try {
      const url = mandate.mode === 'live' ? 'https://api.hyperliquid.xyz/info' : 'https://api.hyperliquid-testnet.xyz/info';
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ type: 'portfolio', user: mandate.hl_wallet_address }),
      });
      if (!r.ok) throw new Error(`HL ${r.status}`);
      const byKey = new Map<string, any>(await r.json());
      const pick = (k: string): Series => {
        const h: Array<[number, string]> = byKey.get(k)?.pnlHistory || [];
        const base = h.length ? Number(h[0][1]) : 0;
        return h.map(([t, v]) => [t, Number(v) - base]);
      };
      return NextResponse.json({
        source: 'hl',
        ranges: { '1D': pick('perpDay'), '7D': pick('perpWeek'), '30D': pick('perpMonth'), All: pick('perpAllTime') },
      });
    } catch (e: any) {
      return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
    }
  }

  const { data } = await getSupabase()
    .from('trades')
    .select('exit_at, realized_pnl_usd')
    .eq('mandate_id', mandate.id)
    .eq('status', 'closed')
    .not('exit_at', 'is', null)
    .order('exit_at', { ascending: true });
  const closes = (data || []).map((t: any) => [new Date(t.exit_at).getTime(), Number(t.realized_pnl_usd) || 0] as [number, number]);
  const now = Date.now();
  const ranges: Record<string, Series> = {};
  for (const r of RANGES) {
    const from = r === 'All' ? (closes[0]?.[0] ?? now) : now - RANGE_MS[r];
    let cum = 0;
    const s: Series = [[from, 0]];
    for (const [t, p] of closes) if (t >= from) { cum += p; s.push([t, cum]); }
    s.push([now, cum]);
    ranges[r] = s;
  }
  return NextResponse.json({ source: 'trades', ranges });
}
