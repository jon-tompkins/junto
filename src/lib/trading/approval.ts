import { sendTelegramMessage, type InlineKeyboardMarkup } from '@/lib/telegram/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { getMandateById, getTradeById, updateTrade, addJournalEntry, updateSignalForTrade } from './db';
import { alpacaForMandate } from './client';
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

  const positionUrl = positionPageUrl(params.decision.ticker);

  await sendTelegramMessage(chatId, body, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `trade_approve:${params.tradeId}` },
          { text: '❌ Skip', callback_data: `trade_skip:${params.tradeId}` },
        ],
        [
          { text: `📊 ${params.decision.ticker} on myjunto`, url: positionUrl },
        ],
      ],
    },
  });
}

function positionPageUrl(ticker: string): string {
  const base = process.env.NEXTAUTH_URL || 'https://myjunto.xyz';
  return `${base.replace(/\/$/, '')}/positions/${encodeURIComponent(ticker)}`;
}

// Called from the Telegram webhook callback_query handler.
export async function handleApprovalCallback(params: {
  data: string;
  chatId: number;
}): Promise<{ message: string; replyMarkup?: InlineKeyboardMarkup }> {
  // Re-propose: spin up a fresh proposal at current price using the original thesis.
  const repMatch = /^trade_repropose:([0-9a-f-]+)$/i.exec(params.data);
  if (repMatch) {
    const { reproposeTrade } = await import('./repropose');
    const result = await reproposeTrade(repMatch[1]);
    if (!result.ok) return { message: `❌ ${result.error}` };
    return { message: `🔄 Re-proposed ${result.ticker} at $${result.proposalPrice.toFixed(2)} (${result.qty} sh). Check the new proposal above.` };
  }

  const match = /^trade_(approve|skip):([0-9a-f-]+)$/i.exec(params.data);
  if (!match) return { message: 'Unknown action.' };

  const [, action, tradeId] = match;
  const result = action === 'skip'
    ? await skipTrade(tradeId, 'telegram')
    : await approveTrade(tradeId, 'telegram');

  if (result.slippageBlocked) {
    return {
      message: result.message,
      replyMarkup: {
        inline_keyboard: [[
          { text: '🔄 Re-propose now', callback_data: `trade_repropose:${tradeId}` },
        ]],
      },
    };
  }
  return { message: result.message };
}

export interface ActionResult {
  ok: boolean;
  message: string;
  slippageBlocked?: boolean;
}

// Cancel a pending trade. Shared by Telegram callback and web button.
export async function skipTrade(tradeId: string, source: 'telegram' | 'web'): Promise<ActionResult> {
  const trade = await getTradeById(tradeId);
  if (!trade) return { ok: false, message: 'Trade not found.' };
  if (trade.status !== 'pending') return { ok: false, message: `Trade already ${trade.status}.` };

  await updateTrade(tradeId, { status: 'cancelled' });
  await addJournalEntry({
    tradeId,
    kind: 'entry',
    content: `[skipped by user via ${source}]`,
  });
  await updateSignalForTrade(tradeId, { decision: 'user_skipped', decisionReason: 'user_skipped' });
  return { ok: true, message: `Skipped ${trade.ticker}.` };
}

// Approve + submit a pending trade. Shared by Telegram callback and web button.
// Runs the 1% slippage guard against live price before submitting to Alpaca.
export async function approveTrade(tradeId: string, source: 'telegram' | 'web'): Promise<ActionResult> {
  const trade = await getTradeById(tradeId);
  if (!trade) return { ok: false, message: 'Trade not found.' };
  if (trade.status !== 'pending') return { ok: false, message: `Trade already ${trade.status}.` };

  const mandate = await getMandateById(trade.mandate_id);
  if (!mandate) return { ok: false, message: 'Mandate missing.' };

  try {
    const alpaca = alpacaForMandate(mandate);

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
          return {
            ok: false,
            slippageBlocked: true,
            message: `⚠️ Blocked ${trade.ticker} — price moved ${(drift * 100).toFixed(2)}% (proposal $${proposalPrice.toFixed(2)} → now $${livePrice.toFixed(2)}). Re-propose if you still want in.`,
          };
        }
      }
    }

    // Entry first (market, day — Alpaca requires day on market orders).
    // We deliberately do NOT submit a bracket here: bracket child legs
    // inherit the parent's TIF=day and expire at market close, leaving the
    // position naked overnight. Instead, after the entry fills we attach a
    // GTC OCO stop+limit so protection survives across sessions.
    const order = await alpaca.submitMarketOrder({
      symbol: trade.ticker,
      qty: Number(trade.qty),
      side: trade.side === 'long' ? 'buy' : 'sell',
      clientOrderId: `junto-${tradeId}`,
    });

    await updateTrade(tradeId, { alpaca_order_id: order.id });

    // Poll up to ~30s for the entry to fill, then attach GTC OCO protection.
    // After fill, retry protection up to 3 times because Alpaca's positions
    // endpoint can lag by a few seconds — without the retry, protectMandate
    // returns `no_position` and the position sits naked until next tick.
    const { protectMandate } = await import('./protection');
    let protectedNow = false;
    let filled = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const status = await alpaca.getOrder(order.id);
        if (status.status === 'filled' || (Number(status.filled_qty) || 0) > 0) {
          filled = true;
          break;
        }
        if (status.status === 'rejected' || status.status === 'canceled' || status.status === 'expired') {
          break;
        }
      } catch {
        // ignore poll errors
      }
    }

    if (filled) {
      for (let attempt = 0; attempt < 3 && !protectedNow; attempt++) {
        try {
          const r = await protectMandate(mandate.id);
          const ours = r.results.find((x) => x.ticker.toUpperCase() === trade.ticker.toUpperCase());
          if (ours?.action === 'protected' || ours?.action === 'already_protected') {
            protectedNow = true;
          } else {
            // no_position race or transient error — wait and retry
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: `[approved by user via ${source}, submitted market order_id=${order.id}${protectedNow ? ', GTC OCO protection attached' : ', awaiting fill — protector will attach GTC OCO on next tick'}]`,
    });
    await updateSignalForTrade(tradeId, { decision: 'submitted', decisionReason: 'user_approved' });
    return { ok: true, message: `✅ Submitted ${trade.ticker}${protectedNow ? ' — filled + protected.' : ' — awaiting fill.'}` };
  } catch (err: any) {
    await updateTrade(tradeId, { status: 'rejected' });
    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: `[approval submitted but broker rejected: ${err.message}]`,
    });
    return { ok: false, message: `❌ Broker rejected: ${err.message?.slice(0, 200)}` };
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
