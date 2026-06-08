import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, canAccessTrade } from '@/lib/trading/access';
import { reproposeTrade } from '@/lib/trading/repropose';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await canAccessTrade(id, access))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await reproposeTrade(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    tradeId: result.newTradeId,
    proposalPrice: result.proposalPrice,
    qty: result.qty,
  });
}
