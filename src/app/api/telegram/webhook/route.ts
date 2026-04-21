import { NextRequest, NextResponse } from 'next/server';
import { consumeLinkCode } from '@/lib/telegram/link';
import { sendTelegramMessage } from '@/lib/telegram/client';

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

  const msg = update.message;
  if (!msg?.text || !msg.chat?.id) return NextResponse.json({ ok: true });

  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  // /start <code> — account linking
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

  // Bare /start with no code — onboarding hint
  if (/^\/start(?:@\w+)?\s*$/.test(text)) {
    await sendTelegramMessage(
      chatId,
      `👋 <b>Junto</b>\n\nTo link your account, open any newsletter on <a href="https://www.myjunto.xyz">myjunto.xyz</a>, hit <i>Subscribe</i>, switch to Telegram delivery, and copy the <code>/start</code> command into this chat.`,
    );
    return NextResponse.json({ ok: true });
  }

  // Everything else — silent ignore (phase 1 is delivery-only, not conversational)
  return NextResponse.json({ ok: true });
}

// Minimal type for the fields we use from the TG update payload
interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { username?: string };
  };
}
