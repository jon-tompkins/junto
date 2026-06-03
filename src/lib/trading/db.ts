import { getSupabase } from '@/lib/db/client';
import type { Mandate, ExtractedSignal, TradeDecision, SignalDecision } from './types';

export async function getActiveMandates(): Promise<Mandate[]> {
  const { data, error } = await getSupabase()
    .from('trading_mandates')
    .select('*')
    .eq('status', 'active');
  if (error) throw error;
  return (data || []) as Mandate[];
}

export async function getMandateById(id: string): Promise<Mandate | null> {
  const { data, error } = await getSupabase()
    .from('trading_mandates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Mandate) || null;
}

export interface TradeRow {
  id: string;
  mandate_id: string;
  ticker: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number | null;
  entry_at: string | null;
  exit_price: number | null;
  exit_at: string | null;
  proposal_price: number | null;
  execution_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  alpaca_order_id: string | null;
  status: 'pending' | 'open' | 'closed' | 'cancelled' | 'rejected';
  realized_pnl_usd: number | null;
}

export async function getOpenTrades(mandateId: string): Promise<TradeRow[]> {
  const { data, error } = await getSupabase()
    .from('trades')
    .select('*')
    .eq('mandate_id', mandateId)
    .in('status', ['pending', 'open']);
  if (error) throw error;
  return (data || []) as TradeRow[];
}

export async function getTradeById(id: string): Promise<TradeRow | null> {
  const { data, error } = await getSupabase()
    .from('trades')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as TradeRow) || null;
}

export async function createPendingTrade(params: {
  mandateId: string;
  ticker: string;
  side: 'long' | 'short';
  qty: number;
  stopPrice: number;
  targetPrice: number;
  proposalPrice: number;
}): Promise<string> {
  const { data, error } = await getSupabase()
    .from('trades')
    .insert({
      mandate_id: params.mandateId,
      ticker: params.ticker,
      side: params.side,
      qty: params.qty,
      stop_price: params.stopPrice,
      target_price: params.targetPrice,
      proposal_price: params.proposalPrice,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateTrade(
  id: string,
  patch: Partial<TradeRow>,
): Promise<void> {
  const { error } = await getSupabase()
    .from('trades')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function addJournalEntry(params: {
  tradeId: string;
  kind: 'entry' | 'daily' | 'exit' | 'post_mortem';
  content: string;
  sourceUrls?: string[];
  processScore?: number;
  outcomeScore?: number;
}): Promise<void> {
  const { error } = await getSupabase().from('trade_journal_entries').insert({
    trade_id: params.tradeId,
    kind: params.kind,
    content: params.content,
    source_urls: params.sourceUrls ?? null,
    process_score: params.processScore ?? null,
    outcome_score: params.outcomeScore ?? null,
  });
  if (error) throw error;
}

export async function getJournalEntries(tradeId: string) {
  const { data, error } = await getSupabase()
    .from('trade_journal_entries')
    .select('*')
    .eq('trade_id', tradeId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function logSignal(params: {
  mandateId: string;
  signal: ExtractedSignal | { ticker: string; direction?: string; conviction?: number; rationale?: string; source_urls?: string[] };
  decision: SignalDecision;
  decisionReason?: string;
  tradeId?: string;
}): Promise<void> {
  const { error } = await getSupabase().from('trading_signals').insert({
    mandate_id: params.mandateId,
    ticker: params.signal.ticker,
    direction: params.signal.direction ?? null,
    conviction: params.signal.conviction ?? null,
    rationale: params.signal.rationale ?? null,
    source_urls: params.signal.source_urls ?? null,
    decision: params.decision,
    decision_reason: params.decisionReason ?? null,
    trade_id: params.tradeId ?? null,
  });
  if (error) throw error;
}

export async function logTickRun(params: {
  mandateId: string;
  window: string;
  tweetsReviewed: number;
  signalsExtracted: number;
  decisionsMade: number;
  tradesProposed: number;
  monitoredOpened: number;
  monitoredClosed: number;
  monitoredJournaled: number;
  errors: string[];
  note?: string;
}): Promise<void> {
  const { error } = await getSupabase().from('trading_tick_runs').insert({
    mandate_id: params.mandateId,
    window: params.window,
    tweets_reviewed: params.tweetsReviewed,
    signals_extracted: params.signalsExtracted,
    decisions_made: params.decisionsMade,
    trades_proposed: params.tradesProposed,
    monitored_opened: params.monitoredOpened,
    monitored_closed: params.monitoredClosed,
    monitored_journaled: params.monitoredJournaled,
    errors: params.errors,
    note: params.note ?? null,
  });
  if (error) throw error;
}

export async function getRecentTickRuns(mandateId: string, limit = 20) {
  const { data, error } = await getSupabase()
    .from('trading_tick_runs')
    .select('id, window, tweets_reviewed, signals_extracted, decisions_made, trades_proposed, monitored_opened, monitored_closed, monitored_journaled, errors, note, created_at')
    .eq('mandate_id', mandateId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getJuntoSourceIds(juntoId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('junto_sources')
    .select('source_id')
    .eq('junto_id', juntoId);
  if (error) throw error;
  return (data || []).map((r: any) => r.source_id);
}
