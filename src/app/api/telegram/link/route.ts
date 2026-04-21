import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createLinkCode, getUserTelegramChatId, unlinkTelegram } from '@/lib/telegram/link';

// Session → user.id lookup. Mirrors the pattern in /api/user/settings.
type SessionUserExtra = { twitterId?: string; twitterHandle?: string; email?: string | null };

async function resolveUserId(session: { user?: SessionUserExtra } | null): Promise<string | null> {
  if (!session?.user) return null;
  const supabase = getSupabase();
  const { twitterId, twitterHandle, email } = session.user;

  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).maybeSingle();
    if (data?.id) return data.id;
  }
  if (twitterHandle) {
    const { data } = await supabase.from('users').select('id').eq('twitter_handle', twitterHandle).maybeSingle();
    if (data?.id) return data.id;
  }
  if (email) {
    const { data } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

// POST — generate a one-time code. Returns the code + a t.me deeplink that
// pre-fills /start <code> when the user taps it.
export async function POST() {
  const session = (await getServerSession(authOptions)) as { user?: SessionUserExtra } | null;
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return NextResponse.json({ error: 'Bot username not configured' }, { status: 500 });
  }

  const { code, expiresAt } = await createLinkCode(userId);
  const clean = botUsername.replace('@', '');
  const deeplink = `https://t.me/${clean}?start=${code}`;

  return NextResponse.json({ code, deeplink, expiresAt, botUsername: clean });
}

// GET — current link status for the signed-in user
export async function GET() {
  const session = (await getServerSession(authOptions)) as { user?: SessionUserExtra } | null;
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = await getUserTelegramChatId(userId);
  return NextResponse.json({ linked: !!chatId });
}

// DELETE — unlink
export async function DELETE() {
  const session = (await getServerSession(authOptions)) as { user?: SessionUserExtra } | null;
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await unlinkTelegram(userId);
  return NextResponse.json({ success: true });
}
