import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { loadJuntoSnapshot, extractSignals } from '@/lib/trading/extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Diagnostic: measure the extract funnel for a mandate on FRESH tweets, bypassing
// the per-mandate dedup and with NO side effects (no processed-mark, no trades).
// Reveals whether the collapse is "no tweets", "no signals", or "signals below
// the conviction>=3 bar decide requires". Auth: Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const mandateId = req.nextUrl.searchParams.get('mandateId');
  if (!mandateId) return NextResponse.json({ error: 'mandateId required' }, { status: 400 });

  const supabase = getSupabase();
  const { data: mandate } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('id', mandateId)
    .single();
  if (!mandate) return NextResponse.json({ error: 'mandate not found' }, { status: 404 });

  try {
    // Omit mandateId → skip per-mandate dedup; raw funnel on fresh tweets.
    const snapshot = await loadJuntoSnapshot(mandate.junto_id);
    const signals = await extractSignals(mandate, snapshot);

    const byDirection: Record<string, number> = {};
    const byConviction: Record<string, number> = {};
    for (const s of signals as any[]) {
      byDirection[s.direction] = (byDirection[s.direction] || 0) + 1;
      byConviction[String(s.conviction)] = (byConviction[String(s.conviction)] || 0) + 1;
    }
    const tradeable = (signals as any[]).filter(
      (s) => s.conviction >= 3 && (s.direction === 'long' || s.direction === 'short'),
    ).length;

    return NextResponse.json({
      mandate: mandate.name,
      junto_id: mandate.junto_id,
      tweetCount: snapshot.tweetCount,
      contentBlockChars: snapshot.contentBlock.length,
      signalCount: signals.length,
      byDirection,
      byConviction,
      tradeable_ge3: tradeable,
      sample: (signals as any[]).slice(0, 8).map((s) => ({
        ticker: s.ticker,
        direction: s.direction,
        conviction: s.conviction,
        urls: Array.isArray(s.source_urls) ? s.source_urls.length : 0,
        rationale: String(s.rationale || '').slice(0, 90),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'debug failed', stack: err?.stack?.split('\n').slice(0, 4) }, { status: 500 });
  }
}
