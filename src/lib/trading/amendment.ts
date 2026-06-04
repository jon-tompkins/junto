import { sendTelegramMessage } from '@/lib/telegram/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import {
  getAmendmentById,
  getTradeById,
  getMandateById,
  updateAmendment,
  updateTrade,
  addJournalEntry,
} from './db';
import { alpacaForMandate } from './client';
import type { AmendmentKind } from './types';

const KIND_LABEL: Record<AmendmentKind, string> = {
  stop_move: 'Move stop',
  target_move: 'Move target',
  close: 'Close position',
};

export async function requestAmendmentApproval(params: {
  userId: string;
  mandateName: string;
  ticker: string;
  amendmentId: string;
  kind: AmendmentKind;
  oldValue: number | null;
  newValue: number | null;
  rationale: string;
  sourceUrls?: string[];
}): Promise<void> {
  const chatId = await getUserTelegramChatId(params.userId);
  if (!chatId) {
    await updateAmendment(params.amendmentId, {
      status: 'skipped',
      applied_note: 'no telegram linked',
    });
    return;
  }

  const movement = params.kind === 'close'
    ? `<b>Close ${escapeHtml(params.ticker)}</b> at market`
    : `<b>${KIND_LABEL[params.kind]} on ${escapeHtml(params.ticker)}</b>\n$${(params.oldValue ?? 0).toFixed(2)} → $${(params.newValue ?? 0).toFixed(2)}`;

  const body = `🛠 <b>Amendment</b> — ${escapeHtml(params.mandateName)}

${movement}

<b>Why:</b> ${escapeHtml(params.rationale)}${formatSources(params.sourceUrls)}`;

  const base = (process.env.NEXTAUTH_URL || 'https://myjunto.com').replace(/\/$/, '');
  const positionUrl = `${base}/positions/${encodeURIComponent(params.ticker)}`;

  await sendTelegramMessage(chatId, body, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Apply', callback_data: `amend_approve:${params.amendmentId}` },
          { text: '❌ Skip', callback_data: `amend_skip:${params.amendmentId}` },
        ],
        [
          { text: `📊 ${params.ticker} on myjunto`, url: positionUrl },
        ],
      ],
    },
  });
}

export async function handleAmendmentCallback(params: {
  data: string;
}): Promise<{ message: string }> {
  const match = /^amend_(approve|skip):([0-9a-f-]+)$/i.exec(params.data);
  if (!match) return { message: 'Unknown action.' };
  const [, action, amendmentId] = match;

  const amendment = await getAmendmentById(amendmentId);
  if (!amendment) return { message: 'Amendment not found.' };
  if (amendment.status !== 'pending') {
    return { message: `Amendment already ${amendment.status}.` };
  }

  if (action === 'skip') {
    await updateAmendment(amendmentId, { status: 'skipped' });
    await addJournalEntry({
      tradeId: amendment.trade_id,
      kind: 'daily',
      content: `[amendment skipped by user: ${amendment.kind} → ${amendment.new_value ?? 'close'} — ${amendment.rationale.slice(0, 200)}]`,
    });
    return { message: 'Amendment skipped.' };
  }

  const trade = await getTradeById(amendment.trade_id);
  if (!trade) return { message: 'Trade not found.' };
  const mandate = await getMandateById(trade.mandate_id);
  if (!mandate) return { message: 'Mandate missing.' };

  try {
    const alpaca = alpacaForMandate(mandate);

    if (amendment.kind === 'close') {
      await alpaca.closePosition(trade.ticker);
      await updateAmendment(amendmentId, {
        status: 'applied',
        applied_at: new Date().toISOString(),
        applied_note: 'market close submitted',
      });
      await addJournalEntry({
        tradeId: trade.id,
        kind: 'daily',
        content: `[user closed via amendment — ${amendment.rationale.slice(0, 200)}]`,
      });
      // monitor will catch the position disappearing and finalize status
      return { message: `✅ Closing ${trade.ticker}.` };
    }

    if (amendment.kind === 'stop_move') {
      if (!trade.stop_order_id || amendment.new_value == null) {
        return { message: 'Missing stop order id; cannot patch.' };
      }
      await alpaca.replaceOrder(trade.stop_order_id, { stop_price: amendment.new_value });
      await updateTrade(trade.id, { stop_price: amendment.new_value });
    } else if (amendment.kind === 'target_move') {
      if (!trade.target_order_id || amendment.new_value == null) {
        return { message: 'Missing target order id; cannot patch.' };
      }
      await alpaca.replaceOrder(trade.target_order_id, { limit_price: amendment.new_value });
      await updateTrade(trade.id, { target_price: amendment.new_value });
    }

    await updateAmendment(amendmentId, {
      status: 'applied',
      applied_at: new Date().toISOString(),
      applied_note: `patched to ${amendment.new_value}`,
    });
    await addJournalEntry({
      tradeId: trade.id,
      kind: 'daily',
      content: `[amendment applied: ${amendment.kind} → ${amendment.new_value} — ${amendment.rationale.slice(0, 200)}]`,
    });
    return { message: `✅ Applied ${KIND_LABEL[amendment.kind]} on ${trade.ticker}.` };
  } catch (err: any) {
    await updateAmendment(amendmentId, {
      status: 'rejected',
      applied_note: err.message?.slice(0, 300),
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
