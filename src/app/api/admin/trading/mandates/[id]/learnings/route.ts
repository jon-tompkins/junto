import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { regenerateLearnings } from '@/lib/trading/learnings';

export const maxDuration = 60;

// POST — regenerate the mandate's trading-thoughts doc on demand.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const learnings = await regenerateLearnings(mandate);
    return NextResponse.json({ ok: true, learnings, learnings_updated_at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to regenerate learnings' }, { status: 500 });
  }
}
