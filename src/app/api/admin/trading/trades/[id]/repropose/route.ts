import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import {
  getTradeById,
  getMandateById,
  getJournalEntries,
  createPendingTrade,
  addJournalEntry,
  logSignal,
} from '@/lib/trading/db';
import { alpacaForMandate } from '@/lib/trading/client';
import { requestApproval } from '@/lib/trading/approval';
import type { TradeDecision } from '@/lib/trading/types';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;

  const trade = await getTradeById(id);
  if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  if (trade.status !== 'cancelled' && trade.status !== 'rejected') {
    return NextResponse.json({ error: `Cannot re-propose a ${trade.status} trade` }, { status: 400 });
  }

  const mandate = await getMandateById(trade.mandate_id);
  if (!mandate) return NextResponse.json({ error: 'Mandate missing' }, { status: 404 });

  const proposalPrice = Number(trade.proposal_price);
  const stopPriceOld = Number(trade.stop_price);
  const targetPriceOld = Number(trade.target_price);
  if (!proposalPrice || !stopPriceOld || !targetPriceOld) {
    return NextResponse.json({ error: 'Original trade missing prices — cannot derive percentages' }, { status: 400 });
  }

  // Derive original % offsets from the prior proposal so we keep the same risk shape.
  const stopPct = trade.side === 'long'
    ? ((proposalPrice - stopPriceOld) / proposalPrice) * 100
    : ((stopPriceOld - proposalPrice) / proposalPrice) * 100;
  const targetPct = trade.side === 'long'
    ? ((targetPriceOld - proposalPrice) / proposalPrice) * 100
    : ((proposalPrice - targetPriceOld) / proposalPrice) * 100;

  const alpaca = alpacaForMandate(mandate);
  const livePrice = await alpaca.getLastTrade(trade.ticker);
  if (!livePrice || livePrice <= 0) {
    return NextResponse.json({ error: 'No live quote available' }, { status: 502 });
  }

  // Preserve original notional; round to at least 1 share.
  const originalNotional = Number(trade.qty) * proposalPrice;
  const newQty = Math.max(1, Math.floor(originalNotional / livePrice));

  const newStop = trade.side === 'long'
    ? livePrice * (1 - stopPct / 100)
    : livePrice * (1 + stopPct / 100);
  const newTarget = trade.side === 'long'
    ? livePrice * (1 + targetPct / 100)
    : livePrice * (1 - targetPct / 100);

  // Pull thesis + sources from the original entry journal.
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

  return NextResponse.json({ ok: true, tradeId: newTradeId, proposalPrice: livePrice, qty: newQty });
}
