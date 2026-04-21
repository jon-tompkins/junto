import { getSupabase } from '@/lib/db/client';
import { randomBytes } from 'crypto';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min

// 8-char URL-safe code (base32-ish, ambiguous chars removed)
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function createLinkCode(userId: string): Promise<{ code: string; expiresAt: string }> {
  const supabase = getSupabase();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase.from('telegram_link_codes').insert({
    code,
    user_id: userId,
    expires_at: expiresAt,
  });

  if (error) throw new Error(`Failed to create link code: ${error.message}`);
  return { code, expiresAt };
}

// Called from the Telegram webhook when a user sends /start <code>. Binds
// the chat_id to the user, marks the code consumed.
export async function consumeLinkCode(params: {
  code: string;
  chatId: number;
  username?: string;
}): Promise<{ success: true; userId: string } | { success: false; reason: string }> {
  const supabase = getSupabase();

  const { data: row, error } = await supabase
    .from('telegram_link_codes')
    .select('user_id, expires_at, consumed_at')
    .eq('code', params.code.toUpperCase())
    .maybeSingle();

  if (error) return { success: false, reason: 'lookup_error' };
  if (!row) return { success: false, reason: 'not_found' };
  if (row.consumed_at) return { success: false, reason: 'already_used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { success: false, reason: 'expired' };

  const { error: updateUserErr } = await supabase
    .from('users')
    .update({
      telegram_chat_id: String(params.chatId),
      telegram_username: params.username ?? null,
      telegram_linked_at: new Date().toISOString(),
    })
    .eq('id', row.user_id);

  if (updateUserErr) return { success: false, reason: 'update_user_failed' };

  await supabase
    .from('telegram_link_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('code', params.code.toUpperCase());

  return { success: true, userId: row.user_id };
}

export async function getUserTelegramChatId(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('id', userId)
    .maybeSingle();
  return data?.telegram_chat_id ?? null;
}

export async function unlinkTelegram(userId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('users')
    .update({
      telegram_chat_id: null,
      telegram_username: null,
      telegram_linked_at: null,
    })
    .eq('id', userId);
}
