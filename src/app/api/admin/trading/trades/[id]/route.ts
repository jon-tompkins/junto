import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const supabase = getSupabase();

  const { data: trade, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!trade) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: mandate } = await supabase
    .from('trading_mandates')
    .select('id, name, user_id')
    .eq('id', trade.mandate_id)
    .maybeSingle();

  if (!access.isAdmin && mandate?.user_id !== access.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: entries } = await supabase
    .from('trade_journal_entries')
    .select('*')
    .eq('trade_id', id)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    trade,
    entries: entries || [],
    mandate: mandate ? { id: mandate.id, name: mandate.name } : null,
  });
}
