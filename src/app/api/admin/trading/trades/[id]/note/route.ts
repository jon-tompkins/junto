import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, canAccessTrade } from '@/lib/trading/access';
import { addJournalEntry } from '@/lib/trading/db';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await canAccessTrade(id, access))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) return NextResponse.json({ error: 'Note is empty' }, { status: 400 });

  await addJournalEntry({ tradeId: id, kind: 'note', content });
  return NextResponse.json({ ok: true, message: 'Note saved' });
}
