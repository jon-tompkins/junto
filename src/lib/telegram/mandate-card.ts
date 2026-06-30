import { sendTelegramMessage, type InlineKeyboardMarkup, type TelegramApiError } from './client';
import { getUserTelegramChatId } from './link';
import { getSupabase } from '@/lib/db/client';

// Send a mandate card (trade proposal / amendment) with two resilience guards:
//  1. Auto-heal: if the group send fails because the group upgraded to a
//     supergroup (Telegram returns migrate_to_chat_id), update the stored chat id
//     on every mandate using the old id, then retry at the new id.
//  2. DM fallback: if the group is otherwise unreachable, deliver to the user's
//     DM with a visible note so a card never silently vanishes.
// Returns false only when there's no destination at all (no group + no linked DM).
export async function sendMandateCard(params: {
  userId: string;
  chatIdOverride?: string | null;
  body: string;
  replyMarkup?: InlineKeyboardMarkup;
}): Promise<boolean> {
  const overrideNum = params.chatIdOverride ? Number(params.chatIdOverride) : null;
  const override = overrideNum && !Number.isNaN(overrideNum) ? overrideNum : null;
  const dm = await getUserTelegramChatId(params.userId);

  if (!override) {
    if (!dm) return false;
    await sendTelegramMessage(dm, params.body, { replyMarkup: params.replyMarkup });
    return true;
  }

  try {
    await sendTelegramMessage(override, params.body, { replyMarkup: params.replyMarkup });
    return true;
  } catch (err) {
    const migrate = (err as TelegramApiError)?.migrateToChatId;
    if (migrate) {
      // Group upgraded to supergroup → repoint every mandate on the old id, retry.
      try {
        await getSupabase()
          .from('trading_mandates')
          .update({ telegram_chat_id: String(migrate), updated_at: new Date().toISOString() })
          .eq('telegram_chat_id', String(params.chatIdOverride));
      } catch { /* best-effort; still try to deliver */ }
      await sendTelegramMessage(migrate, params.body, { replyMarkup: params.replyMarkup });
      return true;
    }
    // Group unreachable (bot removed, stale id, etc.) → DM fallback with a note.
    if (dm) {
      const note = `⚠️ Couldn't reach the configured group (<code>${params.chatIdOverride}</code>) — sent here instead. Re-link it with <code>/bind</code> inside the group.\n\n`;
      await sendTelegramMessage(dm, note + params.body, { replyMarkup: params.replyMarkup });
      return true;
    }
    throw err;
  }
}
