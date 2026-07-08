import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export type PositionCategory = 'crypto' | 'equity' | 'theme';

export interface PositionGroup {
  ticker: string;
  stance: string;
  count: number;
  fresh_count: number;
  category: PositionCategory;
  sources: Array<{ handle: string; display_name: string | null; avatar_url: string | null; is_stale: boolean }>;
  /** Total closed calls (wins + losses) for this ticker across all sources. */
  closed_count: number;
}

const STALE_DAYS = 30;

function isStalePosition(pos: any): boolean {
  const ref = pos?.last_mentioned || pos?.since;
  if (!ref) return false;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  return days >= STALE_DAYS;
}

// Well-known crypto tickers — anything here beats the equity heuristic
const CRYPTO_TICKERS = new Set([
  'BTC','ETH','SOL','BNB','XRP','ADA','DOT','AVAX','LINK','UNI','MATIC','DOGE',
  'LTC','BCH','ATOM','FIL','TRX','ETC','NEAR','ICP','APT','ARB','OP','PEPE',
  'SHIB','CRO','VET','ALGO','HBAR','XLM','SAND','MANA','AXS','THETA','FTM',
  'ONE','ROSE','ZIL','ENJ','BAT','CVX','CRV','AAVE','COMP','MKR','SNX','YFI',
  'SUSHI','UMA','BAL','RLB','DYDX','INJ','SUI','SEI','TIA','PYTH','JTO','WIF',
  'BONK','FLOKI','BLUR','PENDLE','STRK','WLD','BOME','RNDR','RENDER','FET',
  'AGIX','OCEAN','GRT','LPT','NMR','GF','API3','BAND','TRB','CAKE','GMT',
  'LUNC','LUNA','UST','DAI','USDC','USDT','FRAX','TUSD','BUSD',
]);

// Exchange suffixes that indicate a listed equity
const EXCHANGE_SUFFIX_RE = /^[A-Z0-9]+\.(AX|WA|HK|TO|L|PA|DE|MI|BR|SW|SG|KL|NZ|OL|ST|CO|HE|IS|LS|AS|MC|VX|BK|JK|TW|KS|NS|BO|SN|MX|SA|BA|CR|LN|VI|PR|AT|BU|RO|WA|IR)$/;

function classify(ticker: string): PositionCategory {
  // Spaces or lowercase → descriptive theme
  if (/[\s]/.test(ticker) || /[a-z]/.test(ticker)) return 'theme';
  // Exchange-suffixed tickers (DRO.AX, EOS.AX, VGO.WA) → equity
  if (EXCHANGE_SUFFIX_RE.test(ticker)) return 'equity';
  // Known crypto list wins
  if (CRYPTO_TICKERS.has(ticker)) return 'crypto';
  // Short all-caps (1–5 chars) not in crypto → equity ticker
  if (/^[A-Z]{1,5}$/.test(ticker)) return 'equity';
  return 'theme';
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const juntoId = req.nextUrl.searchParams.get('junto_id');

  // If filtering by junto, resolve which source_ids belong to it
  let allowedSourceIds: Set<string> | null = null;
  if (juntoId) {
    const { data: jSources } = await supabase
      .from('junto_sources')
      .select('source_id')
      .eq('junto_id', juntoId);
    allowedSourceIds = new Set((jSources || []).map((r: any) => r.source_id));
  }

  const { data: profiles, error } = await supabase
    .from('source_analyst_profiles')
    .select('source_id, positions, source:sources(handle_or_url, display_name, avatar_url)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups: Record<string, PositionGroup> = {};

  for (const profile of profiles || []) {
    if (allowedSourceIds && !allowedSourceIds.has(profile.source_id)) continue;
    const positions = (profile.positions as Record<string, any>) || {};
    const src = profile.source as any;
    const handle = src?.handle_or_url ?? '';
    const display_name = src?.display_name ?? null;
    const avatar_url = src?.avatar_url ?? null;

    for (const [ticker, pos] of Object.entries(positions)) {
      const stance = (pos as any).stance as string;
      if (!stance) continue;
      const normalized = ticker.toUpperCase();
      const key = `${normalized}::${stance}`;
      if (!groups[key]) {
        groups[key] = {
          ticker: normalized,
          stance,
          count: 0,
          fresh_count: 0,
          category: classify(normalized),
          sources: [],
          closed_count: 0,
        };
      }
      const stale = isStalePosition(pos);
      groups[key].count += 1;
      if (!stale) groups[key].fresh_count += 1;
      groups[key].sources.push({ handle, display_name, avatar_url, is_stale: stale });
    }
  }

  // Aggregate closed-call counts per ticker from source_call_outcomes.
  // Filter by allowedSourceIds when a junto is selected.
  let closedQuery = supabase
    .from('source_call_outcomes')
    .select('source_id, ticker, outcome')
    .in('outcome', ['win', 'loss']);
  if (allowedSourceIds && allowedSourceIds.size > 0) {
    closedQuery = closedQuery.in('source_id', [...allowedSourceIds]);
  }
  const { data: closedRows } = await closedQuery;
  const closedByTicker = new Map<string, number>();
  for (const row of closedRows || []) {
    const t = (row.ticker as string).toUpperCase();
    closedByTicker.set(t, (closedByTicker.get(t) ?? 0) + 1);
  }

  // Stamp each group with its ticker's closed count.
  for (const g of Object.values(groups)) {
    g.closed_count = closedByTicker.get(g.ticker) ?? 0;
  }

  const items = Object.values(groups).sort((a, b) => b.count - a.count);

  return NextResponse.json({ items });
}
