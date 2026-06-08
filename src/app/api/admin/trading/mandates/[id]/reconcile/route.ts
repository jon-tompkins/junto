import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { reconcileMandate } from '@/lib/trading/reconcile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/admin/trading/mandates/[id]/reconcile
// Pulls live position + open-order state from Alpaca and overwrites any
// drifted fields (qty, stop, target) on the trades table. Flags positions
// that exist at the broker but have no DB row.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const result = await reconcileMandate(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Reconcile failed' }, { status: 500 });
  }
}
