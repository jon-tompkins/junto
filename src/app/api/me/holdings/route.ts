import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getTradingAccess } from '@/lib/trading/access';
import { alpacaForMandate } from '@/lib/trading/client';
import { sliceUnrealized } from '@/lib/trading/pnl';
import type { Mandate } from '@/lib/trading/types';

export interface MandateHolding {
  mandate_id: string;
  mandate_name: string;
  side: 'long' | 'short';
  qty: number;
  entry: number | null;
  current: number | null;
  unrealized_pl: number | null;
  unrealized_plpc: number | null;
}

// Returns the logged-in user's live broker positions, keyed by ticker, so the
// source detail page can cross-reference a source's calls against what the user
// actually holds.
//
// Slice-aware: two mandates can share one Alpaca account (no sub-accounts without
// the Broker API), so getPositions() returns the SAME whole-account book for each.
// Reporting that raw would show both mandates holding the full position. Instead we
// scope each mandate to its own open slices (from the trades table) and compute
// per-slice qty/entry/unrealized against the shared mark — same model the mandate
// detail + portfolio-snapshot endpoints use.
export async function GET() {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ holdings: {} });

  const supabase = getSupabase();
  let query = supabase.from('trading_mandates').select('*').eq('status', 'active');
  if (!access.isAdmin) query = query.eq('user_id', access.userId);
  const { data, error } = await query;
  if (error || !data) return NextResponse.json({ holdings: {} });

  const mandates = data as Mandate[];
  const byTicker: Record<string, MandateHolding[]> = {};

  // Per-mandate open slices (entry/qty/side by ticker), qty-weighted if a mandate
  // somehow has >1 open slice on the same ticker.
  const ids = mandates.map((m) => m.id);
  const slicesByMandate = new Map<string, Map<string, { entry: number; qty: number; side: 'long' | 'short' }>>();
  if (ids.length) {
    const { data: openTrades } = await supabase
      .from('trades')
      .select('mandate_id, ticker, entry_price, qty, side')
      .in('mandate_id', ids)
      .eq('status', 'open');
    for (const t of openTrades || []) {
      const m = slicesByMandate.get(t.mandate_id) || new Map();
      const sym = String(t.ticker).toUpperCase();
      const prev = m.get(sym);
      const qty = Number(t.qty) || 0;
      const entry = Number(t.entry_price) || 0;
      if (prev) {
        const tot = prev.qty + qty;
        m.set(sym, { entry: tot ? (prev.entry * prev.qty + entry * qty) / tot : entry, qty: tot, side: t.side });
      } else {
        m.set(sym, { entry, qty, side: t.side });
      }
      slicesByMandate.set(t.mandate_id, m);
    }
  }

  await Promise.all(
    mandates.map(async (m) => {
      const slices = slicesByMandate.get(m.id);
      if (!slices || !slices.size) return; // nothing this mandate owns
      let positions;
      try {
        positions = await alpacaForMandate(m).getPositions();
      } catch {
        return;
      }
      // Shared mark per ticker from the broker's (blended) book.
      const markBySym = new Map<string, number>();
      for (const p of positions) markBySym.set(String(p.symbol).toUpperCase(), Number(p.current_price) || 0);

      for (const [sym, sl] of slices) {
        const mark = markBySym.get(sym) || null;
        const pl = mark != null ? sliceUnrealized(sl.side, sl.entry, sl.qty, mark) : null;
        const basis = sl.entry * sl.qty;
        const list = (byTicker[sym] ??= []);
        list.push({
          mandate_id: m.id,
          mandate_name: m.name,
          side: sl.side,
          qty: sl.qty,
          entry: sl.entry || null,
          current: mark,
          unrealized_pl: pl,
          // Fraction (e.g. 0.05 = +5%) to match the consumer, which renders ×100.
          unrealized_plpc: pl != null && basis ? pl / basis : null,
        });
      }
    }),
  );

  return NextResponse.json({ holdings: byTicker });
}
