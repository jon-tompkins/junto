import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';

// Owner-scoped: the viewer's own trades on this ticker plus their journal
// notes. Strictly user_id-scoped (admins included) — "I only see my trades".
// Returns an empty list rather than 403 so the asset page can simply render
// nothing for signed-out / non-trading viewers.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ trades: [] });

  const supabase = getSupabase();

  const { data: mandates } = await supabase
    .from('trading_mandates')
    .select('id, name')
    .eq('user_id', access.userId);
  const mandateIds = (mandates || []).map((m: any) => m.id);
  if (mandateIds.length === 0) return NextResponse.json({ trades: [] });
  const mandateName = new Map((mandates || []).map((m: any) => [m.id, m.name as string]));

  const { data: tradeRows } = await supabase
    .from('trades')
    .select('id, mandate_id, ticker, side, qty, status, entry_price, exit_price, entry_at, exit_at, realized_pnl_usd, created_at')
    .in('mandate_id', mandateIds)
    .ilike('ticker', ticker)
    .order('created_at', { ascending: false });
  const trades = tradeRows || [];
  if (trades.length === 0) return NextResponse.json({ trades: [] });

  const tradeIds = trades.map((t: any) => t.id);
  const { data: notes } = await supabase
    .from('trade_journal_entries')
    .select('trade_id, kind, content, process_score, outcome_score, created_at')
    .in('trade_id', tradeIds)
    .order('created_at', { ascending: true });

  const notesByTrade = new Map<string, any[]>();
  for (const n of notes || []) {
    const arr = notesByTrade.get(n.trade_id) || [];
    arr.push(n);
    notesByTrade.set(n.trade_id, arr);
  }

  return NextResponse.json({
    trades: trades.map((t: any) => ({
      ...t,
      mandate_name: mandateName.get(t.mandate_id) || null,
      notes: notesByTrade.get(t.id) || [],
    })),
  });
}
