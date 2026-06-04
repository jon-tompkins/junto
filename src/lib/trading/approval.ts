import { sendTelegramMessage } from '@/lib/telegram/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { getMandateById, getTradeById, updateTrade, addJournalEntry, updateSignalForTrade } from './db';
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

<b>Invalidation:</b> ${escapeHtml(params.decision.invalidation)}${formatSources(params.decision.source_urls)}`;

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
    await updateSignalForTrade(tradeId, { decision: 'user_skipped', decisionReason: 'user_skipped' });
    return { message: `Skipped ${trade.ticker}.` };
  }

  const mandate = await getMandateById(trade.mandate_id);
  if (!mandate) return { message: 'Mandate missing.' };

  try {
    const alpaca = makeAlpaca({ keyId: mandate.alpaca_key_id, secret: mandate.alpaca_secret });

    // 1% slippage guard: re-check live price vs proposal price.
    const proposalPrice = trade.proposal_price ? Number(trade.proposal_price) : null;
    if (proposalPrice && proposalPrice > 0) {
      const livePrice = await alpaca.getLastTrade(trade.ticker).catch(() => null);
      if (livePrice && livePrice > 0) {
        const drift = Math.abs(livePrice - proposalPrice) / proposalPrice;
        if (drift > 0.01) {
          await updateTrade(tradeId, { status: 'cancelled' });
          await addJournalEntry({
            tradeId,
            kind: 'entry',
            content: `[blocked: price moved ${(drift * 100).toFixed(2)}% from proposal ($${proposalPrice.toFixed(2)} → $${livePrice.toFixed(2)}), >1% slippage limit]`,
          });
          return { message: `⚠️ Blocked ${trade.ticker} — price moved ${(drift * 100).toFixed(2)}% (proposal $${proposalPrice.toFixed(2)} → now $${livePrice.toFixed(2)}). Re-propose if you still want in.` };
        }
      }
    }

    const order = await alpaca.submitBracketOrder({
      symbol: trade.ticker,
      qty: Number(trade.qty),
      side: trade.side === 'long' ? 'buy' : 'sell',
      stopPrice: Number(trade.stop_price),
      targetPrice: Number(trade.target_price),
      clientOrderId: `junto-${tradeId}`,
    });

    await updateTrade(tradeId, {
      alpaca_order_id: order.id,
    });
    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: `[approved by user, submitted to Alpaca order_id=${order.id}, awaiting fill]`,
    });
    await updateSignalForTrade(tradeId, { decision: 'submitted', decisionReason: 'user_approved' });
    return { message: `✅ Submitted ${trade.ticker} — awaiting fill.` };
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

function formatSources(urls?: string[]): string {
  if (!urls || urls.length === 0) return '';
  const links = urls.slice(0, 5).map((url, i) => {
    const safe = escapeHtml(url);
    const m = /(?:x|twitter)\.com\/([^/?#]+)/i.exec(url);
    const label = m ? `@${escapeHtml(m[1])}` : `source ${i + 1}`;
    return `<a href="${safe}">${label}</a>`;
  });
  return `\n\n<b>Sources:</b> ${links.join(' · ')}`;
}
