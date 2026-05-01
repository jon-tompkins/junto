import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export type PositionCategory = 'crypto' | 'equity' | 'theme';

export interface PositionGroup {
  ticker: string;
  stance: string;
  count: number;
  category: PositionCategory;
  sources: Array<{ handle: string; display_name: string | null }>;
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

function classify(ticker: string): PositionCategory {
  // Spaces or lowercase → descriptive theme
  if (/[\s]/.test(ticker) || /[a-z]/.test(ticker)) return 'theme';
  // Known crypto list wins
  if (CRYPTO_TICKERS.has(ticker)) return 'crypto';
  // Short all-caps (1–5 chars) not in crypto → equity ticker
  if (/^[A-Z]{1,5}$/.test(ticker)) return 'equity';
  return 'theme';
}

export async function GET() {
  const supabase = getSupabase();

  const { data: profiles, error } = await supabase
    .from('source_analyst_profiles')
    .select('positions, source:sources(handle_or_url, display_name)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups: Record<string, PositionGroup> = {};

  for (const profile of profiles || []) {
    const positions = (profile.positions as Record<string, any>) || {};
    const src = profile.source as any;
    const handle = src?.handle_or_url ?? '';
    const display_name = src?.display_name ?? null;

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
          category: classify(normalized),
          sources: [],
        };
      }
      groups[key].count += 1;
      groups[key].sources.push({ handle, display_name });
    }
  }

  const items = Object.values(groups).sort((a, b) => b.count - a.count);

  return NextResponse.json({ items });
}
