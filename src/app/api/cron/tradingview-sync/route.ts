import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { syncTradingViewForUser } from '@/lib/tradingview';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Daily: re-sync every user who linked a public TradingView watchlist.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: users } = await getSupabase()
    .from('users')
    .select('id')
    .not('tradingview_watchlist_url', 'is', null);

  let ok = 0, failed = 0;
  for (const u of users || []) {
    try { await syncTradingViewForUser(u.id); ok++; }
    catch (e: any) { failed++; console.error('[tradingview-sync]', u.id, e?.message); }
  }
  return NextResponse.json({ processed: (users || []).length, ok, failed });
}
