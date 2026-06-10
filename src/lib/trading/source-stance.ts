import { getSupabase } from '@/lib/db/client';
import {
  getSourceProfile,
  upsertSourceProfile,
  type PositionEntry,
} from '@/lib/db/source-analyst-profiles';

// When a trade we proposed actually fires (user approved, broker filled), echo
// the position back into the analyst profile of every source that drove the
// proposal. The "tracked stances" panel on /sources/[handle] then reflects
// what *we* did about the source's signal, not only what the source tweeted.
//
// Stance derives from trade.side. Existing positions in the same direction
// keep their `since` and just advance `last_mentioned`; opposite stances
// reset since to today (same convention as the tweet analyzer).
export async function recordTradeStanceForSources(tradeId: string): Promise<{
  updated: Array<{ sourceId: string; handle: string; ticker: string }>;
}> {
  const supabase = getSupabase();

  const { data: trade } = await supabase
    .from('trades')
    .select('id, ticker, side, entry_price, proposal_price, target_price')
    .eq('id', tradeId)
    .single();
  if (!trade) return { updated: [] };

  const { data: journals } = await supabase
    .from('trade_journal_entries')
    .select('source_urls, created_at')
    .eq('trade_id', tradeId)
    .eq('kind', 'entry')
    .order('created_at', { ascending: true });
  const urls: string[] = [];
  for (const j of (journals || []) as any[]) {
    if (Array.isArray(j.source_urls)) {
      for (const u of j.source_urls) if (typeof u === 'string') urls.push(u);
    }
    if (urls.length) break;
  }
  if (!urls.length) return { updated: [] };

  // URL → tweet_id → content_twitter.source_id (same join positions-command uses).
  const tweetIds: string[] = [];
  for (const u of urls) {
    const m = /\/status\/(\d+)/i.exec(u);
    if (m) tweetIds.push(m[1]);
  }
  if (!tweetIds.length) return { updated: [] };

  const { data: rows } = await supabase
    .from('content_twitter')
    .select('source_id, sources(id, handle_or_url)')
    .in('twitter_id', tweetIds);

  const sourceIds = new Map<string, string>(); // source_id -> handle
  for (const row of (rows || []) as any[]) {
    const sid = row.sources?.id || row.source_id;
    const handle = row.sources?.handle_or_url || '';
    if (sid) sourceIds.set(sid, handle);
  }
  if (!sourceIds.size) return { updated: [] };

  const ticker = trade.ticker.toUpperCase();
  const stance: PositionEntry['stance'] = trade.side === 'short' ? 'bearish' : 'bullish';
  const todayIso = new Date().toISOString().slice(0, 10);
  const entryPrice = Number(trade.entry_price) || Number(trade.proposal_price) || undefined;
  const targetPrice = Number(trade.target_price) || undefined;

  const updated: Array<{ sourceId: string; handle: string; ticker: string }> = [];
  for (const [sourceId, handle] of sourceIds) {
    const existing = await getSourceProfile(sourceId);
    const positions: Record<string, PositionEntry> = { ...(existing?.positions || {}) };
    const prior = positions[ticker];
    const sameStance = prior?.stance === stance;
    positions[ticker] = {
      stance,
      since: sameStance && prior?.since ? prior.since : todayIso,
      last_mentioned: todayIso,
      note: `Traded by myJunto`,
      ...(entryPrice ? { entry_price: entryPrice } : prior?.entry_price ? { entry_price: prior.entry_price } : {}),
      ...(targetPrice ? { target_price: targetPrice } : prior?.target_price ? { target_price: prior.target_price } : {}),
    };
    await upsertSourceProfile(sourceId, existing?.summary || null, positions);
    updated.push({ sourceId, handle, ticker });
  }

  return { updated };
}
