import { NextRequest, NextResponse } from 'next/server';
import { getMandateById } from '@/lib/trading/db';
import { trailMandateStops } from '@/lib/trading/trailing-stops';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/admin/trading/hl-trail?mandate_id=  (Bearer CRON_SECRET)
// Run the trailing-stop pass for one mandate now instead of waiting for the tick.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const mandate = await getMandateById(req.nextUrl.searchParams.get('mandate_id') || '');
  if (!mandate) return NextResponse.json({ error: 'Mandate not found' }, { status: 404 });
  return NextResponse.json({ ok: true, results: await trailMandateStops(mandate) });
}
