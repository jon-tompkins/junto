import { NextRequest, NextResponse } from 'next/server';
import { getActiveMandates } from '@/lib/trading/db';
import { monitorMandate } from '@/lib/trading/monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Trade reconcile — lightweight position/order sync against Alpaca.
// Runs more frequently than trade-tick so stop/target fills and manual
// closes are picked up promptly without the full extract+decide loop.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mandates = await getActiveMandates();
  const results: Record<string, { opened: number; closed: number; journaled: number } | { error: string }> = {};

  for (const m of mandates) {
    try {
      results[m.name] = await monitorMandate(m);
    } catch (err: any) {
      results[m.name] = { error: err.message };
    }
  }

  return NextResponse.json({ ok: true, mandates: mandates.length, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
