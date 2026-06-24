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
import { protectMandate } from './protection';
import type { AmendmentKind } from './types';

// Alpaca returns 404 / code 40410000 "order not found" when a stored
// stop/target order id is stale (the OCO leg was replaced or expired at the
// broker). We recover from this rather than hard-failing the amendment.
function isOrderNotFound(err: any): boolean {
  const m = String(err?.message || '');
  return /\b404\b/.test(m) || /order not found/i.test(m) || /40410000/.test(m);
}

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

  const base = (process.env.NEXTAUTH_URL || 'https://myjunto.xyz').replace(/\/$/, '');
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

    if (amendment.kind === 'stop_move' || amendment.kind === 'target_move') {
      if (amendment.new_value == null) {
        return { message: `Missing new value; cannot ${amendment.kind}.` };
      }
      const isStop = amendment.kind === 'stop_move';
      const orderId = isStop ? trade.stop_order_id : trade.target_order_id;
      const levelPatch = isStop
        ? { stop_price: amendment.new_value }
        : { target_price: amendment.new_value };

      // Re-attach path: the broker order is missing/stale (404) or we never had
      // an id. Persist the new level, drop the dead id, and let protection
      // re-create a fresh OCO at that level so the move lands instead of failing.
      let needsReattach = !orderId;
      if (orderId) {
        try {
          await alpaca.replaceOrder(
            orderId,
            isStop ? { stop_price: amendment.new_value } : { limit_price: amendment.new_value },
          );
          await updateTrade(trade.id, levelPatch);
        } catch (err: any) {
          if (!isOrderNotFound(err)) throw err;
          needsReattach = true;
        }
      }

      if (needsReattach) {
        await updateTrade(trade.id, {
          ...levelPatch,
          ...(isStop ? { stop_order_id: null } : { target_order_id: null }),
        });
        try {
          await protectMandate(trade.mandate_id);
        } catch {
          // Protection also runs every tick; the new level is already persisted
          // so it will be re-attached on the next sweep regardless.
        }
        await updateAmendment(amendmentId, {
          status: 'applied',
          applied_at: new Date().toISOString(),
          applied_note: `stale/missing order; re-attached protection at ${amendment.new_value}`,
        });
        await addJournalEntry({
          tradeId: trade.id,
          kind: 'daily',
          content: `[amendment applied via re-attach (broker order was stale): ${amendment.kind} → ${amendment.new_value} — ${amendment.rationale.slice(0, 200)}]`,
        });
        return { message: `✅ Applied ${KIND_LABEL[amendment.kind]} on ${trade.ticker} (re-attached protection).` };
      }
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
  // Dedupe by display label: the same handle (or identical URL) must not
  // render as multiple chips. Keep first-seen order.
  const seen = new Set<string>();
  const links: string[] = [];
  for (const url of urls) {
    if (typeof url !== 'string' || !url) continue;
    const m = /(?:x|twitter)\.com\/([^/?#]+)/i.exec(url);
    const label = m ? `@${m[1]}` : url;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(`<a href="${escapeHtml(url)}">${m ? `@${escapeHtml(m[1])}` : `source ${links.length + 1}`}</a>`);
    if (links.length >= 5) break;
  }
  return links.length ? `\n\n<b>Sources:</b> ${links.join(' · ')}` : '';
}
