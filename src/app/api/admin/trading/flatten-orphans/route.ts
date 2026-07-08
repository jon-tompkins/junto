import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from '@/lib/trading/client';
import { getMandateOpenTickers } from '@/lib/trading/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Admin: close ORPHAN broker positions for a mandate — positions the broker
// holds that have NO matching open/submitted trade in our DB (untracked,
// unmanaged: no stops, no monitor). Managed positions are never touched.
// Auth: Bearer CRON_SECRET. Requires &confirm=1 to actually place close orders;
// without it, returns a dry-run preview.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const mandateId = req.nextUrl.searchParams.get('mandateId');
  if (!mandateId) return NextResponse.json({ error: 'mandateId required' }, { status: 400 });
  const confirm = req.nextUrl.searchParams.get('confirm') === '1';

  const { data: mandate } = await getSupabase()
    .from('trading_mandates')
    .select('*')
    .eq('id', mandateId)
    .single();
  if (!mandate) return NextResponse.json({ error: 'mandate not found' }, { status: 404 });

  const alpaca = alpacaForMandate(mandate as any);
  const [positions, managed] = await Promise.all([
    alpaca.getPositions(),
    getMandateOpenTickers(mandateId),
  ]);

  const orphans = positions.filter(
    (p: any) => !managed.has(String(p.symbol).toUpperCase()),
  );

  if (!confirm) {
    return NextResponse.json({
      dryRun: true,
      mandate: (mandate as any).name,
      managedTickers: Array.from(managed),
      orphanCount: orphans.length,
      orphans: orphans.map((p: any) => ({ symbol: p.symbol, qty: p.qty, market_value: p.market_value })),
      note: 'Re-POST with &confirm=1 to close these.',
    });
  }

  const results: any[] = [];
  for (const p of orphans as any[]) {
    try {
      const order = await alpaca.closePosition(p.symbol);
      results.push({ symbol: p.symbol, qty: p.qty, closed: true, orderId: (order as any)?.id ?? null });
    } catch (err: any) {
      results.push({ symbol: p.symbol, qty: p.qty, closed: false, error: err?.message || 'close failed' });
    }
  }

  return NextResponse.json({
    mandate: (mandate as any).name,
    managedTickers: Array.from(managed),
    attempted: orphans.length,
    closed: results.filter((r) => r.closed).length,
    failed: results.filter((r) => !r.closed).length,
    results,
  });
}
