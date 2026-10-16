import { NextRequest, NextResponse } from 'next/server';
import { getMandateById, createPendingTrade, addJournalEntry, logSignal } from '@/lib/trading/db';
import { alpacaForMandate } from '@/lib/trading/client';
import { requestApproval } from '@/lib/trading/approval';
import { isTrailing, trailPricePct } from '@/lib/trading/trailing-stops';

export const dynamic = 'force-dynamic';

// POST /api/admin/trading/hl-propose (Bearer CRON_SECRET)
// { mandate_id, ticker, side, thesis, invalidation?, source_urls[], conviction? }
// Hand-picked HL proposal (e.g. roster consensus) sent through the normal
// Telegram approval flow, sized and protected exactly like an engine proposal:
// margin = max_position_pct% of capital × leverage, trailing stop (no TP) when
// the mandate trails. source_urls should be the copied wallets' hypurrscan
// links so the trailing logic can tell when they exit.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const mandate = await getMandateById(String(body.mandate_id || ''));
  if (!mandate) return NextResponse.json({ error: 'Mandate not found' }, { status: 404 });
  if (mandate.broker !== 'hyperliquid') return NextResponse.json({ error: 'HL mandates only' }, { status: 400 });
  const ticker = String(body.ticker || '').toUpperCase();
  const side = body.side === 'short' ? 'short' : 'long';
  if (!ticker || !body.thesis) return NextResponse.json({ error: 'ticker + thesis required' }, { status: 400 });

  const price = await alpacaForMandate(mandate).getLastTrade(ticker);
  if (!price || price <= 0) return NextResponse.json({ error: `No quote for ${ticker}` }, { status: 500 });

  const lev = Math.max(1, mandate.hl_max_leverage ?? 3);
  const margin = mandate.capital_allotted_usd * (mandate.max_position_pct / 100);
  if (margin * lev < 10) return NextResponse.json({ error: 'below HL $10 minimum' }, { status: 400 });
  const qty = (margin * lev) / price;

  const trailing = isTrailing(mandate);
  const stopPct = trailing ? Number(trailPricePct(mandate, Number(mandate.trailing_stop_pct)).toFixed(2)) : Number(body.stop_pct) || 5;
  const targetPct = trailing ? 0 : Number(body.target_pct) || 10;
  const dir = side === 'long' ? 1 : -1;
  const stopPrice = price * (1 - dir * stopPct / 100);
  const targetPrice = trailing ? null : price * (1 + dir * targetPct / 100);
  const sourceUrls: string[] = Array.isArray(body.source_urls) ? body.source_urls : [];
  const conviction = Math.min(5, Math.max(1, Number(body.conviction) || 3)) as 1 | 2 | 3 | 4 | 5;
  const invalidation = String(body.invalidation || 'Copied traders exit the position (trail tightens).');

  const tradeId = await createPendingTrade({ mandateId: mandate.id, ticker, side, qty, stopPrice, targetPrice, proposalPrice: price });
  await addJournalEntry({ tradeId, kind: 'entry', content: `Thesis: ${body.thesis}\n\nInvalidation: ${invalidation}\n\nConviction ${conviction}/5.`, sourceUrls });
  await logSignal({ mandateId: mandate.id, signal: { ticker, direction: side, conviction, rationale: String(body.thesis).slice(0, 300), source_urls: sourceUrls }, decision: 'skipped_awaiting_approval', decisionReason: 'manual_hl_proposal', tradeId });
  await requestApproval({
    userId: mandate.user_id,
    chatIdOverride: mandate.telegram_chat_id,
    mandateName: mandate.name,
    tradeId,
    decision: { ticker, side, notional_usd: margin, entry_thesis: String(body.thesis), invalidation, stop_pct: stopPct, target_pct: targetPct, expected_hold_days: 3, source_urls: sourceUrls, conviction },
    entryPrice: price,
    leverage: lev,
  });
  return NextResponse.json({ ok: true, tradeId, ticker, side, qty, price, stopPrice, margin, notional: margin * lev });
}
