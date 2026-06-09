import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { protectMandate } from '@/lib/trading/protection';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/admin/trading/mandates/[id]/protect
// Scans all open trades for this mandate and re-attaches GTC OCO stop+limit
// for any position whose original bracket day-legs have expired.
// Auth: session-based trading access OR `Authorization: Bearer $CRON_SECRET`.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const bearer = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = bearer && cronSecret && bearer === `Bearer ${cronSecret}`;
  const { id } = await ctx.params;
  if (!bearerOk) {
    const access = await getTradingAccess();
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const mandate = await getAccessibleMandate(id, access);
    if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } else {
    const { data: m } = await getSupabase().from('trading_mandates').select('id').eq('id', id).maybeSingle();
    if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const result = await protectMandate(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Protect failed' }, { status: 500 });
  }
}
