import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';


// Themes and macro words that extractors emit as "tickers" but aren't tradable symbols.
const NON_TICKERS = new Set(['AI', 'AGI', 'USD', 'GOLD', 'OIL', 'CRYPTO', 'ALTCOINS', 'ETFS', 'BONDS', 'STOCKS']);
const isRealTicker = (t: unknown) => typeof t === 'string' && t === t.toUpperCase() && !NON_TICKERS.has(t);

// GET /api/public/pulse?days=7&asset=equity — aggregates for the public /pulse dashboard.
// One RPC (public_pulse_summary) so row-count caps can't undercount; cached 5 min at the edge.
export async function GET(req: NextRequest) {
  const days = [1, 7, 30].includes(parseInt(req.nextUrl.searchParams.get('days') || '', 10))
    ? parseInt(req.nextUrl.searchParams.get('days')!, 10)
    : 7;
  const assetParam = req.nextUrl.searchParams.get('asset');
  const asset = assetParam && ['equity', 'crypto', 'sector'].includes(assetParam) ? assetParam : null;

  // Wire/news accounts (sources.is_reporter) report, they don't make calls: kept out of every list.
  const { data: rep } = await getSupabase().from('sources').select('handle_or_url').eq('is_reporter', true);
  const reporterHandles = (rep || []).map((r: any) => String(r.handle_or_url).replace(/^@/, '').toLowerCase());

  const { data, error } = await getSupabase().rpc('public_pulse_summary', {
    window_days: days,
    asset,
    exclude_handles: reporterHandles,
  });
  if (error) {
    console.error('[public/pulse]', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const clean = { ...data } as Record<string, unknown>;
  for (const key of ['hot', 'consensus', 'new_calls', 'best_open', 'worst_open', 'recent_closed']) {
    if (Array.isArray(clean[key])) clean[key] = (clean[key] as { ticker?: string }[]).filter((r) => isRealTicker(r.ticker));
  }
  return NextResponse.json(clean, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
