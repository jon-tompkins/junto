import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { skipTrade } from '@/lib/trading/approval';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const result = await skipTrade(id, 'web');
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
