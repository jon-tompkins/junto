import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getTradingAccess } from '@/lib/trading/access';
import { alpacaForMandate } from '@/lib/trading/client';
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
// actually holds. Positions are fetched live from each active mandate's broker;
// a mandate whose broker isn't reachable just contributes nothing.
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

  await Promise.all(
    mandates.map(async (m) => {
      let positions;
      try {
        positions = await alpacaForMandate(m).getPositions();
      } catch {
        return;
      }
      for (const p of positions) {
        const list = (byTicker[p.symbol] ??= []);
        list.push({
          mandate_id: m.id,
          mandate_name: m.name,
          side: p.side,
          qty: Number(p.qty) || 0,
          entry: Number(p.avg_entry_price) || null,
          current: Number(p.current_price) || null,
          unrealized_pl: p.unrealized_pl != null ? Number(p.unrealized_pl) : null,
          unrealized_plpc: p.unrealized_plpc != null ? Number(p.unrealized_plpc) : null,
        });
      }
    }),
  );

  return NextResponse.json({ holdings: byTicker });
}
