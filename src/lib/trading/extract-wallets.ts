// Wallet-junto extractor: turns Hyperliquid whale position-change events into
// the same ExtractedSignal shape the tweet path produces, so a wallet-only
// junto feeds the existing decide step. No NLP — the signal is the on-chain move.
//
// A junto is a "wallet junto" when its sources are type='hyperliquid_wallet'
// (handle_or_url = the followed wallet address). One junto type per mandate.
import { getSupabase } from '@/lib/db/client';
import { getProcessedTweetIds } from './db';
import type { Mandate, ExtractedSignal } from './types';

const HYPURRSCAN = 'https://hypurrscan.io/address/';
const LOOKBACK_HOURS = 24;

export async function isWalletJunto(juntoId: string | null): Promise<boolean> {
  if (!juntoId) return false;
  const { data } = await getSupabase()
    .from('junto_sources')
    .select('sources!inner(type)')
    .eq('junto_id', juntoId)
    .eq('sources.type', 'hyperliquid_wallet')
    .limit(1);
  return !!(data && data.length);
}

// Conviction from how much the move is of the WHALE's book + their leverage —
// a big, high-leverage entry is a louder signal. Floor of 3 so genuine whale
// moves clear the decide gate (they're real money, worth surfacing).
function eventConviction(pctOfAccount: number, leverage: number): 1 | 2 | 3 | 4 | 5 {
  if (pctOfAccount >= 15 || leverage >= 20) return 5;
  if (pctOfAccount >= 8 || leverage >= 10) return 4;
  return 3;
}

export async function loadWalletSignals(
  mandate: Mandate,
): Promise<{ signals: ExtractedSignal[]; reviewedEventIds: string[]; eventCount: number }> {
  const empty = { signals: [], reviewedEventIds: [], eventCount: 0 };
  if (!mandate.junto_id) return empty;
  const supabase = getSupabase();

  // Followed wallet addresses = the junto's hyperliquid_wallet sources.
  const { data: srcRows } = await supabase
    .from('junto_sources')
    .select('sources!inner(handle_or_url, type)')
    .eq('junto_id', mandate.junto_id)
    .eq('sources.type', 'hyperliquid_wallet');
  const addresses = (srcRows || [])
    .map((r: any) => r.sources?.handle_or_url as string | undefined)
    .filter((a): a is string => !!a);
  if (addresses.length === 0) return empty;

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
  const { data: events } = await supabase
    .from('hl_wallet_events')
    .select('id, address, label, coin, kind, side, leverage, position_value, pct_of_account, detected_at')
    .in('address', addresses)
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })
    .limit(200);

  const all = events || [];
  const allIds = all.map((e: any) => e.id as string);
  const processed = await getProcessedTweetIds(mandate.id, allIds);
  const fresh = all.filter((e: any) => !processed.has(e.id));

  const signals: ExtractedSignal[] = [];
  for (const e of fresh) {
    let direction: ExtractedSignal['direction'];
    if (e.kind === 'closed') direction = 'exit';
    else if (e.kind === 'opened' || e.kind === 'increased' || e.kind === 'flipped') {
      direction = e.side === 'short' ? 'short' : 'long';
    } else {
      continue; // 'decreased' = trim, informational only
    }
    const pct = Number(e.pct_of_account) || 0;
    const lev = Number(e.leverage) || 0;
    const who = e.label || `${String(e.address).slice(0, 8)}…`;
    const usd = Math.round(Number(e.position_value) || 0).toLocaleString();
    signals.push({
      ticker: String(e.coin).toUpperCase(),
      direction,
      conviction: direction === 'exit' ? 4 : eventConviction(pct, lev),
      rationale: `${who} ${e.kind} ${e.side || ''} ${e.coin} — $${usd} (${pct.toFixed(0)}% of book, ${lev}x)`.replace(/\s+/g, ' ').trim(),
      source_urls: [`${HYPURRSCAN}${e.address}`],
    });
  }

  return { signals, reviewedEventIds: allIds, eventCount: fresh.length };
}
