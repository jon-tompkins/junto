import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { alpacaForMandate } from '@/lib/trading/client';

export const dynamic = 'force-dynamic';

// Live Alpaca snapshot for a single mandate — positions (last price + unrealized
// P/L per symbol) + account (equity, cash). Safe to poll every 10-15s; no DB
// joins beyond the mandate lookup.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const positions: Record<string, { current_price: number; unrealized_pl: number }> = {};
  let account: { equity: number | null; cash: number | null } = { equity: null, cash: null };
  try {
    const alp = alpacaForMandate(mandate as any);
    const [acc, live] = await Promise.all([
      alp.getAccount().catch(() => null),
      alp.getPositions().catch(() => [] as any[]),
    ]);
    if (acc) account = { equity: Number(acc.equity) || null, cash: Number(acc.cash) || null };
    for (const p of live) {
      positions[p.symbol.toUpperCase()] = {
        current_price: Number(p.current_price) || 0,
        unrealized_pl: Number(p.unrealized_pl) || 0,
      };
    }
  } catch {
    // leave defaults
  }

  return NextResponse.json({
    positions,
    account,
    fetched_at: new Date().toISOString(),
  });
}
