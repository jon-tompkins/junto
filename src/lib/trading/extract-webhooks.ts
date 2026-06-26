import { getSupabase } from '@/lib/db/client';
import { getProcessedTweetIds } from './db';
import type { Mandate, ExtractedSignal } from './types';

// A junto is a "webhook junto" if any of its sources is an external_signal_webhook.
// Mirrors isWalletJunto — one junto is one modality.
export async function isWebhookJunto(juntoId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('junto_sources')
    .select('source:sources(type)')
    .eq('junto_id', juntoId);
  return (data || []).some((r: any) => r.source?.type === 'external_signal_webhook');
}

// Load fresh inbound webhook signals for a mandate's junto and shape them into the
// same ExtractedSignal the decide step consumes. Dedup per-mandate via the shared
// trading_processed_tweets table (keyed by webhook_signals.id), so the same idea
// isn't re-proposed every tick.
export async function loadWebhookSignals(mandate: Mandate): Promise<{
  signals: ExtractedSignal[];
  eventCount: number;
  reviewedEventIds: string[];
}> {
  const supabase = getSupabase();

  const { data: js } = await supabase
    .from('junto_sources')
    .select('source:sources(id, type)')
    .eq('junto_id', mandate.junto_id);
  const sourceIds = (js || [])
    .map((r: any) => r.source)
    .filter((s: any) => s && s.type === 'external_signal_webhook')
    .map((s: any) => s.id);
  if (sourceIds.length === 0) return { signals: [], eventCount: 0, reviewedEventIds: [] };

  // 48h window covers a daily screener plus weekends/holidays.
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: rows } = await supabase
    .from('webhook_signals')
    .select('id, ticker, direction, conviction, rationale, source_urls')
    .in('source_id', sourceIds)
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(200);

  const all = rows || [];
  const processed = await getProcessedTweetIds(mandate.id, all.map((r: any) => r.id));
  const fresh = all.filter((r: any) => !processed.has(r.id));

  const signals: ExtractedSignal[] = fresh.map((r: any) => ({
    ticker: String(r.ticker).toUpperCase(),
    direction: (r.direction || 'long') as ExtractedSignal['direction'],
    conviction: Math.max(1, Math.min(5, Number(r.conviction) || 3)) as ExtractedSignal['conviction'],
    rationale: r.rationale || `External signal: ${r.ticker} ${r.direction || 'long'}`,
    source_urls: Array.isArray(r.source_urls) ? r.source_urls : [],
  }));

  return { signals, eventCount: all.length, reviewedEventIds: fresh.map((r: any) => r.id) };
}
