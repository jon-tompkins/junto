import { NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getUserTelegramChatId } from '@/lib/telegram/link';

export async function GET() {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const chatId = await getUserTelegramChatId(access.userId);
  return NextResponse.json({ linked: !!chatId });
}
