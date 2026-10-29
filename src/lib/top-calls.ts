import { getSupabase } from '@/lib/db/client';
import { isPriceable, type AssetClass } from '@/lib/prices';

// Handles whose "positions" are mostly headline reposts / scanner output, not first-person
// calls (Oct 16 position audit, plus x-growth/wire-accounts.json). They feed dispatches but
// are never ranked as callers. Lowercase. Replace with a DB-backed reporter flag once it exists.
export const REPORTER_HANDLES = new Set([
  'lookonchain', 'unusual_whales', 'deitaone', 'cryptorank_io', 'breakoutstocks',
  'messaricrypto', 'defillama', 'm_mcdonough', 'maverickny', 'allthingsapx',
  'zerohedge_', 'zerohedge', 'wallstreetbets', 'bespokeinvest', 'theaigrid',
  'ai_explained_', 'biologyaidaily',
]);

export const WINDOW_DAYS = 7;
const MAX_MARK_AGE_DAYS = 3; // ignore marks the daily mark-positions cron hasn't refreshed
const MAX_ABS_RETURN = 400; // beyond this it's almost certainly a split / bad print

export interface TopCall {
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  ticker: string;
  stance: 'bullish' | 'bearish';
  conviction: number | null;
  asset_class: string;
  entry_price: number;
  mark_price: number | null;
  return_pct: number;
  alpha_pct: number | null;
  called_at: string;
}

/** Calls made in the last WINDOW_DAYS, ranked by the return ALREADY STORED on source_positions
 *  (entry = signal-day close, marked daily). No live pricing. */
export async function getTopCalls(): Promise<{ calls: TopCall[]; updatedAt: string | null }> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('source_positions')
    .select('source_id, ticker, stance, conviction, asset_class, entry_at, since, entry_price, mark_price, mark_return_pct, mark_alpha_pct, is_reaction, marked_at')
    .in('stance', ['bullish', 'bearish'])
    .not('mark_return_pct', 'is', null)
    .not('entry_price', 'is', null)
    .or(`entry_at.gte.${since},and(entry_at.is.null,since.gte.${since.slice(0, 10)})`)
    .limit(3000);
  if (error) throw new Error(error.message);

  const markCutoff = Date.now() - MAX_MARK_AGE_DAYS * 86_400_000;
  const rows = (data || []).filter((p: any) => {
    if (p.is_reaction === true) return false; // already moved before the post
    if (!p.marked_at || new Date(p.marked_at).getTime() < markCutoff) return false;
    if (!isPriceable(p.ticker, (p.asset_class ?? undefined) as AssetClass)) return false;
    if (p.asset_class === 'sector' || p.asset_class === 'theme') return false;
    return Math.abs(p.mark_return_pct) <= MAX_ABS_RETURN;
  });

  const ids = Array.from(new Set(rows.map((p: any) => p.source_id)));
  const { data: srcs } = ids.length
    ? await supabase.from('sources').select('id, handle_or_url, display_name, avatar_url').in('id', ids)
    : { data: [] as any[] };
  const byId = new Map<string, any>((srcs || []).map((s: any) => [s.id, s]));

  // One row per (source, ticker); best-of is fine since the table is already unique on it.
  const calls: TopCall[] = [];
  for (const p of rows as any[]) {
    const s = byId.get(p.source_id);
    if (!s || REPORTER_HANDLES.has(String(s.handle_or_url).toLowerCase())) continue;
    calls.push({
      source_id: p.source_id,
      handle: s.handle_or_url,
      display_name: s.display_name,
      avatar_url: s.avatar_url,
      ticker: p.ticker,
      stance: p.stance,
      conviction: typeof p.conviction === 'number' ? p.conviction : null,
      asset_class: p.asset_class || 'equity',
      entry_price: Number(p.entry_price),
      mark_price: p.mark_price != null ? Number(p.mark_price) : null,
      return_pct: Number(p.mark_return_pct),
      alpha_pct: p.mark_alpha_pct != null ? Number(p.mark_alpha_pct) : null,
      called_at: p.entry_at || p.since,
    });
  }
  calls.sort((a, b) => b.return_pct - a.return_pct);
  const updatedAt = (data || []).reduce((m: string | null, p: any) => (p.marked_at && (!m || p.marked_at > m) ? p.marked_at : m), null);
  return { calls, updatedAt };
}
