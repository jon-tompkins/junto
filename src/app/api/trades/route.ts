import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { classifyTicker } from '@/lib/prices';

export const revalidate = 0;

// A "trade" = one specific position from one specific source (a row inside a
// source_analyst_profiles.positions blob), plus closed calls from
// source_call_outcomes. This board flattens every source's book into individual,
// filterable/sortable trades. Prices/returns for ACTIVE trades are filled in
// client-side via /api/prices/batch; CLOSED trades carry their realized return.

interface TradeRow {
  id: string;
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  ticker: string;
  stance: string;
  conviction: number | null;
  asset_class: string;
  entry_price: number | null;
  target_price: number | null;
  since: string | null;
  days: number | null;
  status: 'active' | 'stale' | 'closed';
  return_pct: number | null; // active: null until client marks-to-market; closed: realized
  junto_ids: string[];
}

const dayCount = (iso: string | null): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

export async function GET() {
  try {
    const supabase = getSupabase();

    const [sourcesRes, profilesRes, juntoSrcRes, juntosRes, closedRes] = await Promise.all([
      supabase.from('sources').select('id, handle_or_url, display_name, avatar_url'),
      supabase.from('source_analyst_profiles').select('source_id, positions'),
      supabase.from('junto_sources').select('junto_id, source_id'),
      supabase.from('juntos').select('id, name').eq('is_public', true),
      supabase
        .from('source_call_outcomes')
        .select('source_id, ticker, stance, entry_price, return_pct, close_reason')
        .order('created_at', { ascending: false })
        .limit(1500),
    ]);

    const sourceById = new Map<string, any>();
    for (const s of sourcesRes.data || []) sourceById.set(s.id, s);

    const publicJuntoIds = new Set((juntosRes.data || []).map((j: any) => j.id));
    const juntosBySource = new Map<string, string[]>();
    for (const js of juntoSrcRes.data || []) {
      if (!publicJuntoIds.has(js.junto_id)) continue;
      const arr = juntosBySource.get(js.source_id) || [];
      arr.push(js.junto_id);
      juntosBySource.set(js.source_id, arr);
    }

    const rows: TradeRow[] = [];

    // Active trades — one per (source, ticker) in the positions blob.
    for (const prof of profilesRes.data || []) {
      const src = sourceById.get(prof.source_id);
      if (!src) continue;
      const positions = (prof.positions || {}) as Record<string, any>;
      for (const [ticker, pos] of Object.entries(positions)) {
        const since = pos.last_mentioned || pos.since || null;
        const days = dayCount(since);
        const stale = days != null && days >= 30;
        rows.push({
          id: `${prof.source_id}:${ticker}`,
          source_id: prof.source_id,
          handle: src.handle_or_url,
          display_name: src.display_name,
          avatar_url: src.avatar_url,
          ticker,
          stance: pos.stance || 'neutral',
          conviction: typeof pos.conviction === 'number' ? pos.conviction : null,
          asset_class: pos.asset_class || classifyTicker(ticker),
          entry_price: typeof pos.entry_price === 'number' ? pos.entry_price : null,
          target_price: typeof pos.target_price === 'number' ? pos.target_price : null,
          since,
          days,
          status: stale ? 'stale' : 'active',
          return_pct: null,
          junto_ids: juntosBySource.get(prof.source_id) || [],
        });
      }
    }

    // Closed trades — realized outcomes.
    for (const c of closedRes.data || []) {
      const src = sourceById.get(c.source_id);
      if (!src) continue;
      rows.push({
        id: `${c.source_id}:${c.ticker}:closed`,
        source_id: c.source_id,
        handle: src.handle_or_url,
        display_name: src.display_name,
        avatar_url: src.avatar_url,
        ticker: c.ticker,
        stance: c.stance || 'neutral',
        conviction: null,
        asset_class: classifyTicker(c.ticker),
        entry_price: typeof c.entry_price === 'number' ? c.entry_price : null,
        target_price: null,
        since: null,
        days: null,
        status: 'closed',
        return_pct: typeof c.return_pct === 'number' ? c.return_pct : null,
        junto_ids: juntosBySource.get(c.source_id) || [],
      });
    }

    const juntos = (juntosRes.data || []).map((j: any) => ({ id: j.id, name: j.name }));
    return NextResponse.json({ trades: rows, juntos });
  } catch (err) {
    console.error('[GET /api/trades]', err);
    return NextResponse.json({ error: 'Failed to load trades', trades: [], juntos: [] }, { status: 500 });
  }
}
