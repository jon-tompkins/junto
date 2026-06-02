import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const session = await getServerSession(authOptions);
  const supabase = getSupabase();

  let userId: string | null = null;
  const twitterId = (session?.user as any)?.twitterId;
  const googleId = (session?.user as any)?.googleId;
  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    userId = data?.id || null;
  } else if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    userId = data?.id || null;
  }
  if (!userId) return NextResponse.json({ linked: false });

  const chatId = await getUserTelegramChatId(userId);
  return NextResponse.json({ linked: !!chatId });
}
