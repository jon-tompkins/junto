import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getMandateById, createPendingTrade, addJournalEntry, logSignal } from '@/lib/trading/db';
import { alpacaForMandate } from '@/lib/trading/client';
import { requestApproval } from '@/lib/trading/approval';

export const dynamic = 'force-dynamic';

// Synthetic trade proposal — bypasses signal extraction and decision LLMs to
// test the end-to-end approval + broker submission flow.
export async function POST(req: NextRequest) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const mandateId = body.mandate_id as string;
  const ticker = (body.ticker || 'SPY').toUpperCase();
  if (!mandateId) return NextResponse.json({ error: 'mandate_id required' }, { status: 400 });

  const mandate = await getMandateById(mandateId);
  if (!mandate) return NextResponse.json({ error: 'Mandate not found' }, { status: 404 });
  if (!access.isAdmin && mandate.user_id !== access.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let lastPrice: number;
  try {
    const alpaca = alpacaForMandate(mandate);
    const price = await alpaca.getLastTrade(ticker);
    if (!price || price <= 0) throw new Error(`No quote for ${ticker}`);
    lastPrice = price;
  } catch (err: any) {
    return NextResponse.json({ error: `Quote failed: ${err.message}` }, { status: 500 });
  }

  const notional = Math.min(500, mandate.capital_allotted_usd * 0.05);
  const qty = Math.max(1, Math.floor(notional / lastPrice));
  const stopPct = 2;
  const targetPct = 4;
  const stopPrice = lastPrice * (1 - stopPct / 100);
  const targetPrice = lastPrice * (1 + targetPct / 100);

  const tradeId = await createPendingTrade({
    mandateId,
    ticker,
    side: 'long',
    qty,
    stopPrice,
    targetPrice,
    proposalPrice: lastPrice,
  });

  await addJournalEntry({
    tradeId,
    kind: 'entry',
    content: `[TEST PROPOSAL] Synthetic trade injected from admin UI to verify the approval + broker flow. Not derived from junto signals. Approve to see whether Alpaca paper accepts the bracket order; skip to cancel.`,
  });

  await logSignal({
    mandateId,
    signal: { ticker, direction: 'long', conviction: 3 },
    decision: 'skipped_awaiting_approval',
    decisionReason: 'test_proposal',
    tradeId,
  });

  await requestApproval({
    userId: mandate.user_id,
    mandateName: mandate.name,
    tradeId,
    decision: {
      ticker,
      side: 'long',
      notional_usd: notional,
      entry_thesis: `[TEST PROPOSAL] Synthetic test of the approval flow. ${ticker} is a high-liquidity test ticker, not a real recommendation.`,
      invalidation: `[TEST PROPOSAL] N/A — manually inject test only.`,
      stop_pct: stopPct,
      target_pct: targetPct,
      expected_hold_days: 1,
      source_urls: [],
      conviction: 3,
    },
    entryPrice: lastPrice,
  });

  return NextResponse.json({ ok: true, tradeId, ticker, qty, entryPrice: lastPrice });
}
