import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, canAccessTrade } from '@/lib/trading/access';
import { reproposeTrade } from '@/lib/trading/repropose';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Bearer $CRON_SECRET bypasses session auth so ops agents can re-propose
  // a cancelled/rejected trade directly (e.g. after debugging a race).
  const bearer = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!bearer && !!cronSecret && bearer === `Bearer ${cronSecret}`;

  if (!bearerOk) {
    const access = await getTradingAccess();
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!(await canAccessTrade(id, access))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await reproposeTrade(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    tradeId: result.newTradeId,
    proposalPrice: result.proposalPrice,
    qty: result.qty,
  });
}
