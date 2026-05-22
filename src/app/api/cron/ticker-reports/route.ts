import { NextRequest, NextResponse } from 'next/server';
import { getAllWatchlistTickers } from '@/lib/db/watchlist';
import { generateTickerReport } from '@/lib/jobs/generate-ticker-report';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tickers = await getAllWatchlistTickers();
  const results: Array<{ ticker: string; ok: boolean; error?: string; tweetCount?: number }> = [];

  for (const ticker of tickers) {
    try {
      const r = await generateTickerReport(ticker);
      results.push({ ticker, ok: true, tweetCount: r.tweetCount });
    } catch (err: any) {
      results.push({ ticker, ok: false, error: err?.message || String(err) });
    }
  }

  return NextResponse.json({
    processed: tickers.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
