import { NextRequest, NextResponse } from 'next/server';
import { markOpenPositions } from '@/lib/position-marks';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily after the US close: mark open analyst positions to market (smart-money input).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await markOpenPositions());
  } catch (e) {
    const message = e instanceof Error ? e.message : 'failed';
    console.error('[mark-positions]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
