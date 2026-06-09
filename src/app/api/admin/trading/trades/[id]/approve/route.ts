import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, canAccessTrade } from '@/lib/trading/access';
import { approveTrade } from '@/lib/trading/approval';

// approveTrade polls fill for ~30s then retries protection — needs room above default 10s.
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await canAccessTrade(id, access))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = await approveTrade(id, 'web');
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
