import {
  getTradeById,
  getMandateById,
  getJournalEntries,
  createPendingTrade,
  addJournalEntry,
  logSignal,
} from './db';
import { alpacaForMandate } from './client';
import { requestApproval } from './approval';
import type { TradeDecision } from './types';

export interface ReproposeResult {
  ok: true;
  newTradeId: string;
  ticker: string;
  proposalPrice: number;
  qty: number;
}

export interface ReproposeError {
  ok: false;
  error: string;
}

// Shared logic for both the web API route and the Telegram callback button.
// Pulls fresh quote, preserves the original notional + risk shape, copies the
// thesis/sources, and fires a new Telegram approval message.
export async function reproposeTrade(tradeId: string): Promise<ReproposeResult | ReproposeError> {
  const trade = await getTradeById(tradeId);
  if (!trade) return { ok: false, error: 'Trade not found' };
  if (trade.status !== 'cancelled' && trade.status !== 'rejected') {
    return { ok: false, error: `Cannot re-propose a ${trade.status} trade` };
  }

  const mandate = await getMandateById(trade.mandate_id);
  if (!mandate) return { ok: false, error: 'Mandate missing' };

  const proposalPrice = Number(trade.proposal_price);
  const stopPriceOld = Number(trade.stop_price);
  const targetPriceOld = Number(trade.target_price);
  if (!proposalPrice || !stopPriceOld || !targetPriceOld) {
    return { ok: false, error: 'Original trade missing prices — cannot derive percentages' };
  }

  const stopPct = trade.side === 'long'
    ? ((proposalPrice - stopPriceOld) / proposalPrice) * 100
    : ((stopPriceOld - proposalPrice) / proposalPrice) * 100;
  const targetPct = trade.side === 'long'
    ? ((targetPriceOld - proposalPrice) / proposalPrice) * 100
    : ((proposalPrice - targetPriceOld) / proposalPrice) * 100;

  const alpaca = alpacaForMandate(mandate);
  const livePrice = await alpaca.getLastTrade(trade.ticker);
  if (!livePrice || livePrice <= 0) {
    return { ok: false, error: 'No live quote available' };
  }

  const originalNotional = Number(trade.qty) * proposalPrice;
  const newQty = Math.max(1, Math.floor(originalNotional / livePrice));

  const newStop = trade.side === 'long'
    ? livePrice * (1 - stopPct / 100)
    : livePrice * (1 + stopPct / 100);
  const newTarget = trade.side === 'long'
    ? livePrice * (1 + targetPct / 100)
    : livePrice * (1 - targetPct / 100);

  const entries = await getJournalEntries(trade.id);
  const originalEntry = entries.find((e: any) => e.kind === 'entry' && !/^\[/.test(e.content || ''));
  const thesisRaw: string = originalEntry?.content || 'Re-proposed (original thesis unavailable).';
  const sourceUrls: string[] = (originalEntry?.source_urls as string[] | null) || [];

  const thesisMatch = /Thesis:\s*([\s\S]*?)(?:\n\nInvalidation:|$)/.exec(thesisRaw);
  const invalidationMatch = /Invalidation:\s*([\s\S]*?)(?:\n\nExpected hold|$)/.exec(thesisRaw);
  const entryThesis = (thesisMatch?.[1] || thesisRaw).trim();
  const invalidation = (invalidationMatch?.[1] || '').trim() || 'Stop at the level set below.';

  const newTradeId = await createPendingTrade({
    mandateId: mandate.id,
    ticker: trade.ticker,
    side: trade.side,
    qty: newQty,
    stopPrice: newStop,
    targetPrice: newTarget,
    proposalPrice: livePrice,
  });

  await addJournalEntry({
    tradeId: newTradeId,
    kind: 'entry',
    content: `Thesis: ${entryThesis}\n\nInvalidation: ${invalidation}\n\n[re-proposed from trade ${trade.id} at $${livePrice.toFixed(2)} — prior proposal $${proposalPrice.toFixed(2)}]`,
    sourceUrls,
  });

  const decision: TradeDecision = {
    ticker: trade.ticker,
    side: trade.side,
    notional_usd: newQty * livePrice,
    entry_thesis: entryThesis,
    invalidation,
    stop_pct: Number(stopPct.toFixed(2)),
    target_pct: Number(targetPct.toFixed(2)),
    expected_hold_days: 5,
    source_urls: sourceUrls,
    conviction: 3,
  };

  await logSignal({
    mandateId: mandate.id,
    signal: { ticker: trade.ticker, direction: trade.side, conviction: 3, rationale: entryThesis.slice(0, 300), source_urls: sourceUrls },
    decision: 'skipped_awaiting_approval',
    decisionReason: 'reproposed_awaiting_user_approval',
    tradeId: newTradeId,
  });

  await requestApproval({
    userId: mandate.user_id,
    mandateName: mandate.name,
    tradeId: newTradeId,
    decision,
    entryPrice: livePrice,
  });

  return { ok: true, newTradeId, ticker: trade.ticker, proposalPrice: livePrice, qty: newQty };
}
