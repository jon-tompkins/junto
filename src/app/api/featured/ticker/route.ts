import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from '@/lib/trading/client';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

// Featured mandate that feeds the landing-page ticker. Hardcoded for now —
// once we add a featured/public flag on trading_mandates we'll resolve it via
// query.
const FEATURED_MANDATE_ID = '046a90f7-27ac-4e41-9b36-50354715ad34';

export interface TickerEntry {
  ticker: string;
  side: 'long' | 'short';
  price: number | null;
  change_pct: number | null;
}

export async function GET() {
  const supabase = getSupabase();
  const { data: mandate } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('id', FEATURED_MANDATE_ID)
    .single();

  const { data: trades } = await supabase
    .from('trades')
    .select('ticker, side')
    .eq('mandate_id', FEATURED_MANDATE_ID)
    .eq('status', 'open');

  const tickers = (trades || []).map((t) => ({ ticker: t.ticker.toUpperCase(), side: t.side as 'long' | 'short' }));

  let entries: TickerEntry[] = tickers.map((t) => ({ ...t, price: null, change_pct: null }));

  if (mandate) {
    try {
      const alpaca = alpacaForMandate(mandate as any);
      const positions = await alpaca.getPositions().catch(() => [] as any[]);
      const bySym = new Map<string, any>();
      for (const p of positions) bySym.set(String(p.symbol).toUpperCase(), p);
      entries = tickers.map((t) => {
        const p = bySym.get(t.ticker);
        return {
          ...t,
          price: p ? Number(p.current_price) || null : null,
          change_pct: p && Number(p.lastday_price) > 0
            ? ((Number(p.current_price) - Number(p.lastday_price)) / Number(p.lastday_price)) * 100
            : null,
        };
      });
    } catch {
      // fall through with no prices
    }
  }

  return NextResponse.json({
    mandate_name: mandate?.name || null,
    entries,
    fetched_at: new Date().toISOString(),
  });
}
