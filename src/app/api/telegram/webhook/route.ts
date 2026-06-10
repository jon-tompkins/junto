import { NextRequest, NextResponse } from 'next/server';
import { consumeLinkCode, getUserIdByTelegramChatId } from '@/lib/telegram/link';
import { sendTelegramMessage, answerCallbackQuery, editMessageReplyMarkup } from '@/lib/telegram/client';
import { handleApprovalCallback } from '@/lib/trading/approval';
import { handleAmendmentCallback } from '@/lib/trading/amendment';
import { buildPositionsMessage } from '@/lib/trading/positions-command';
import {
  buildPnlMessage,
  buildMandatesMessage,
  setMandateStatus,
  closeTickerCommand,
  buildTicksMessage,
} from '@/lib/trading/telegram-commands';

export const dynamic = 'force-dynamic';
// Trade approval polls fill for ~30s + protection retry — needs room above default 10s.
export const maxDuration = 60;

// Telegram webhook. Configured via setWebhook during deploy (see
// scripts/setup-telegram-webhook.ts). Handles /start <code> for account linking.
//
// Telegram optionally signs requests via the secret_token header — we verify
// against TELEGRAM_WEBHOOK_SECRET if set.

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get('x-telegram-bot-api-secret-token');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Callback queries — inline button presses (trade approvals, etc.)
  if (update.callback_query) {
    const cb = update.callback_query;
    if (cb.data?.startsWith('trade_')) {
      // Ack the callback and strip the inline keyboard immediately so a slow
      // approveTrade (Alpaca submit + 30s fill poll + OCO attach) can't blow
      // past Telegram's ~15s callback deadline, which leaves the button looking
      // unresponsive and tempts the user to double-tap. The real result message
      // goes out as a follow-up below.
      await answerCallbackQuery(cb.id, 'Working…').catch(() => {});
      if (cb.message) {
        await editMessageReplyMarkup(cb.message.chat.id, cb.message.message_id).catch(() => {});
      }
      try {
        const result = await handleApprovalCallback({ data: cb.data, chatId: cb.message?.chat?.id ?? 0 });
        if (cb.message) {
          await sendTelegramMessage(cb.message.chat.id, result.message, { replyMarkup: result.replyMarkup });
        }
      } catch (err: any) {
        console.error('[trade approval]', err);
        if (cb.message) {
          await sendTelegramMessage(cb.message.chat.id, '⚠️ Error processing approval. Check the trade page.').catch(() => {});
        }
      }
    } else if (cb.data?.startsWith('amend_')) {
      try {
        const result = await handleAmendmentCallback({ data: cb.data });
        await answerCallbackQuery(cb.id, result.message);
        if (cb.message) {
          await editMessageReplyMarkup(cb.message.chat.id, cb.message.message_id);
          await sendTelegramMessage(cb.message.chat.id, result.message);
        }
      } catch (err: any) {
        await answerCallbackQuery(cb.id, 'Error processing.');
        console.error('[amend approval]', err);
      }
    } else {
      await answerCallbackQuery(cb.id);
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (!msg?.text || !msg.chat?.id) return NextResponse.json({ ok: true });

  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  const startMatch = /^\/start(?:@\w+)?\s+([A-Z0-9]{4,16})\s*$/i.exec(text);
  if (startMatch) {
    const code = startMatch[1];
    const result = await consumeLinkCode({ code, chatId, username });
    if (result.success) {
      await sendTelegramMessage(
        chatId,
        `✅ <b>Linked.</b>\n\nYour Junto account is now connected. Subscribe to a newsletter and choose Telegram delivery to receive it here.`,
      );
    } else {
      const msgByReason: Record<string, string> = {
        not_found: '❌ That code is invalid. Generate a new one from your Junto dashboard.',
        expired: '⏳ That code has expired. Generate a fresh one from your Junto dashboard.',
        already_used: '⚠️ That code has already been used.',
        lookup_error: '⚠️ Something went wrong on our end. Try again in a minute.',
        update_user_failed: '⚠️ Couldn\'t link your account. Try again or contact support.',
      };
      await sendTelegramMessage(chatId, msgByReason[result.reason] ?? msgByReason.lookup_error);
    }
    return NextResponse.json({ ok: true });
  }

  if (/^\/help(?:@\w+)?\s*$/i.test(text)) {
    await sendTelegramMessage(
      chatId,
      `<b>Junto bot commands</b>\n\n` +
      `/positions — open positions + unrealized P&amp;L\n` +
      `/pnl — realized today/7d/all-time + equity\n` +
      `/mandates — list your mandates\n` +
      `/ticks — recent tick-run activity\n` +
      `/pause &lt;name&gt; — pause a mandate\n` +
      `/resume &lt;name&gt; — resume a mandate\n` +
      `/close &lt;ticker&gt; — market-close any open position\n` +
      `/help — this menu\n` +
      `/start — link your Junto account\n\n` +
      `Trade proposals arrive here automatically. Tap ✅ Approve, ❌ Skip, or 🔄 Re-propose on the message itself.`,
    );
    return NextResponse.json({ ok: true });
  }

  const tradingCmdMatch = /^\/(positions|pnl|mandates|ticks|pause|resume|close)(?:@\w+)?(?:\s+(.+))?$/i.exec(text);
  if (tradingCmdMatch) {
    const cmd = tradingCmdMatch[1].toLowerCase();
    const arg = (tradingCmdMatch[2] || '').trim();
    const userId = await getUserIdByTelegramChatId(chatId);
    if (!userId) {
      await sendTelegramMessage(
        chatId,
        '⚠️ This chat isn\'t linked to a Junto account yet. Open <a href="https://myjunto.xyz">myjunto.xyz</a> → Settings → Link Telegram.',
      );
      return NextResponse.json({ ok: true });
    }
    try {
      let body: string;
      switch (cmd) {
        case 'positions': body = await buildPositionsMessage(userId); break;
        case 'pnl':       body = await buildPnlMessage(userId); break;
        case 'mandates':  body = await buildMandatesMessage(userId); break;
        case 'ticks':     body = await buildTicksMessage(userId); break;
        case 'pause':     body = await setMandateStatus(userId, arg, 'paused'); break;
        case 'resume':    body = await setMandateStatus(userId, arg, 'active'); break;
        case 'close':     body = await closeTickerCommand(userId, arg); break;
        default:          body = 'Unknown command.';
      }
      await sendTelegramMessage(chatId, body);
    } catch (err: any) {
      console.error(`[/${cmd}]`, err);
      await sendTelegramMessage(chatId, `⚠️ Command failed: ${err?.message?.slice(0, 200) || 'unknown'}`);
    }
    return NextResponse.json({ ok: true });
  }

  if (/^\/start(?:@\w+)?\s*$/.test(text)) {
    await sendTelegramMessage(
      chatId,
      `👋 <b>Junto</b>\n\nTo link your account, open any newsletter on <a href="https://www.myjunto.xyz">myjunto.xyz</a>, hit <i>Subscribe</i>, switch to Telegram delivery, and copy the <code>/start</code> command into this chat.`,
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
    from?: { id: number; username?: string };
  };
}
