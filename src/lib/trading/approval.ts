import { sendTelegramMessage } from '@/lib/telegram/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { getMandateById, getTradeById, updateTrade, addJournalEntry, logSignal } from './db';
import { makeAlpaca } from './alpaca';
import type { TradeDecision } from './types';

export async function requestApproval(params: {
  userId: string;
  mandateName: string;
  tradeId: string;
  decision: TradeDecision;
  entryPrice: number;
}): Promise<void> {
  const chatId = await getUserTelegramChatId(params.userId);
  if (!chatId) {
    await addJournalEntry({
      tradeId: params.tradeId,
      kind: 'entry',
      content: '[awaiting approval — user has no telegram linked, trade will not auto-submit]',
    });
    return;
  }

  const stopPrice = params.decision.side === 'long'
    ? params.entryPrice * (1 - params.decision.stop_pct / 100)
    : params.entryPrice * (1 + params.decision.stop_pct / 100);
  const targetPrice = params.decision.side === 'long'
    ? params.entryPrice * (1 + params.decision.target_pct / 100)
    : params.entryPrice * (1 - params.decision.target_pct / 100);

  const body = `🤖 <b>Trade proposal</b> — ${escapeHtml(params.mandateName)}

<b>${params.decision.side === 'long' ? 'BUY' : 'SHORT'} ${escapeHtml(params.decision.ticker)}</b>
Notional: $${params.decision.notional_usd.toFixed(0)} @ ~$${params.entryPrice.toFixed(2)}
Stop: $${stopPrice.toFixed(2)} (-${params.decision.stop_pct}%)  Target: $${targetPrice.toFixed(2)} (+${params.decision.target_pct}%)
Hold: ~${params.decision.expected_hold_days}d  Conviction: ${params.decision.conviction}/5

<b>Thesis:</b> ${escapeHtml(params.decision.entry_thesis)}

<b>Invalidation:</b> ${escapeHtml(params.decision.invalidation)}`;

  await sendTelegramMessage(chatId, body, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `trade_approve:${params.tradeId}` },
          { text: '❌ Skip', callback_data: `trade_skip:${params.tradeId}` },
        ],
      ],
    },
  });
}

// Called from the Telegram webhook callback_query handler.
export async function handleApprovalCallback(params: {
  data: string;
  chatId: number;
}): Promise<{ message: string }> {
  const match = /^trade_(approve|skip):([0-9a-f-]+)$/i.exec(params.data);
  if (!match) return { message: 'Unknown action.' };

  const [, action, tradeId] = match;
  const trade = await getTradeById(tradeId);
  if (!trade) return { message: 'Trade not found.' };
  if (trade.status !== 'pending') {
    return { message: `Trade already ${trade.status}.` };
  }

  if (action === 'skip') {
    await updateTrade(tradeId, { status: 'cancelled' });
    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: '[skipped by user via Telegram]',
    });
    await logSignal({
      mandateId: trade.mandate_id,
      signal: { ticker: trade.ticker },
      decision: 'skipped_awaiting_approval',
      decisionReason: 'user_skipped',
      tradeId,
    });
    return { message: `Skipped ${trade.ticker}.` };
  }

  const mandate = await getMandateById(trade.mandate_id);
  if (!mandate) return { message: 'Mandate missing.' };

  try {
    const alpaca = makeAlpaca({ keyId: mandate.alpaca_key_id, secret: mandate.alpaca_secret });
    const order = await alpaca.submitBracketOrder({
      symbol: trade.ticker,
      qty: Number(trade.qty),
      side: trade.side === 'long' ? 'buy' : 'sell',
      stopPrice: Number(trade.stop_price),
      targetPrice: Number(trade.target_price),
      clientOrderId: `junto-${tradeId}`,
    });

    await updateTrade(tradeId, {
      status: 'open',
      alpaca_order_id: order.id,
      entry_at: new Date().toISOString(),
    });
    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: `[approved by user, submitted to Alpaca order_id=${order.id}]`,
    });
    return { message: `✅ Submitted ${trade.ticker}.` };
  } catch (err: any) {
    await updateTrade(tradeId, { status: 'rejected' });
    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: `[approval submitted but broker rejected: ${err.message}]`,
    });
    return { message: `❌ Broker rejected: ${err.message?.slice(0, 200)}` };
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
