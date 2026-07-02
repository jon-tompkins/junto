import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Ideal-portfolio calculator for a junto (v1, read-only, ad hoc).
// Turns the junto's collective FRESH positioning into a conviction-weighted
// target book against a supplied portfolio value. Iterative — no orders, no
// price/share math yet; just target %/$ so we can eyeball it vs reality.

const STALE_DAYS = 30;
// Only real tradeable tickers — exclude sector/theme keys ("biotech", "uranium",
// "semiconductors"). Cashtag-shaped: 1-6 uppercase letters + optional .XX suffix.
const TICKER_RE = /^[A-Z]{1,6}(\.[A-Z]{1,3})?$/;
// Uppercase concept/theme labels that pass TICKER_RE but aren't tradeable single
// names ("AI" the concept, not $AI). Used only when asset_class isn't tagged yet.
const CONCEPT_DENY = new Set(['AI', 'DEFI', 'NFT', 'NFTS', 'RWA', 'RWAS', 'MEME', 'MEMES', 'ALT', 'ALTS', 'ALTCOINS', 'WEB3', 'DEX', 'CEX', 'TRADFI', 'CEFI']);

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  last_mentioned?: string;
  conviction?: number;
  asset_class?: 'equity' | 'crypto' | 'sector';
}

// Equities + crypto only. Prefer the model's asset_class tag; fall back to the
// ticker-shape + concept denylist heuristic for positions not yet re-tagged.
function isTradeable(ticker: string, pos: PositionEntry): boolean {
  if (pos.asset_class) return pos.asset_class === 'equity' || pos.asset_class === 'crypto';
  return TICKER_RE.test(ticker) && !CONCEPT_DENY.has(ticker);
}

function isFresh(pos: PositionEntry): boolean {
  const ref = pos.last_mentioned || pos.since;
  if (!ref) return false;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  return days < STALE_DAYS;
}

export async function GET(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const juntoId = req.nextUrl.searchParams.get('juntoId');
  const value = Math.max(0, Number(req.nextUrl.searchParams.get('value')) || 10000);
  // Optional cap on number of holdings — keep the top-N by conviction, then
  // re-normalize weights across the kept set. 0/absent = unlimited.
  const maxPositions = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get('maxPositions')) || 0));
  if (!juntoId) return NextResponse.json({ error: 'juntoId required' }, { status: 400 });

  const supabase = getSupabase();

  const [{ data: junto }, { data: links }] = await Promise.all([
    supabase.from('juntos').select('id, name').eq('id', juntoId).maybeSingle(),
    supabase
      .from('junto_sources')
      .select('source:sources(id, handle_or_url, display_name)')
      .eq('junto_id', juntoId),
  ]);
  if (!junto) return NextResponse.json({ error: 'Junto not found' }, { status: 404 });

  const sources = (links || [])
    .map((l: any) => l.source)
    .filter(Boolean) as { id: string; handle_or_url: string; display_name: string | null }[];
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const { data: profiles } = sources.length
    ? await supabase
        .from('source_analyst_profiles')
        .select('source_id, positions')
        .in('source_id', sources.map((s) => s.id))
    : { data: [] as any[] };

  // Aggregate per ticker: net directional conviction (bullish +, bearish −;
  // neutral/cautious don't push a direction in v1) summed across fresh sources.
  interface Agg {
    ticker: string;
    net: number; // signed conviction sum
    gross: number; // |conviction| sum, for transparency
    longC: number;
    shortC: number;
    backers: { handle: string; stance: string; conviction: number }[];
  }
  const byTicker = new Map<string, Agg>();

  for (const prof of (profiles as any[]) || []) {
    const src = sourceById.get(prof.source_id);
    if (!src) continue;
    const positions = (prof.positions || {}) as Record<string, PositionEntry>;
    for (const [rawTicker, pos] of Object.entries(positions)) {
      const ticker = rawTicker.toUpperCase();
      if (!isTradeable(ticker, pos)) continue; // equities + crypto only (drop sectors/concepts)
      if (!isFresh(pos)) continue; // fresh only
      const conv = Math.max(1, Math.min(5, pos.conviction ?? 1));
      const dir = pos.stance === 'bullish' ? 1 : pos.stance === 'bearish' ? -1 : 0;
      if (dir === 0) continue; // neutral/cautious: no directional weight in v1
      const agg = byTicker.get(ticker) || { ticker, net: 0, gross: 0, longC: 0, shortC: 0, backers: [] };
      agg.net += dir * conv;
      agg.gross += conv;
      if (dir > 0) agg.longC += conv; else agg.shortC += conv;
      agg.backers.push({ handle: src.handle_or_url, stance: pos.stance, conviction: conv });
      byTicker.set(ticker, agg);
    }
  }

  // Weight by |net| — a ticker where the junto is split nets down; strong
  // one-sided conviction dominates. Cap to top-N (if requested) BEFORE weighting
  // so the kept set re-normalizes cleanly to 100% of portfolio value.
  let aggs = [...byTicker.values()]
    .filter((a) => a.net !== 0)
    .sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
  const totalCandidates = aggs.length;
  if (maxPositions > 0) aggs = aggs.slice(0, maxPositions);
  const totalAbs = aggs.reduce((sum, a) => sum + Math.abs(a.net), 0);

  const holdings = aggs
    .map((a) => {
      const weight = totalAbs ? Math.abs(a.net) / totalAbs : 0;
      return {
        ticker: a.ticker,
        direction: a.net > 0 ? ('long' as const) : ('short' as const),
        net_conviction: a.net,
        weight_pct: weight * 100,
        target_usd: weight * value,
        backer_count: a.backers.length,
        backers: a.backers.sort((x, y) => y.conviction - x.conviction),
      };
    })
    .sort((x, y) => y.weight_pct - x.weight_pct);

  return NextResponse.json({
    junto: { id: junto.id, name: junto.name },
    portfolio_value: value,
    max_positions: maxPositions || null,
    source_count: sources.length,
    holding_count: holdings.length,
    // How many fresh directional names existed before the cap — so the UI can
    // say "showing top 10 of 23".
    candidate_count: totalCandidates,
    holdings,
    generated_at: new Date().toISOString(),
  });
}
