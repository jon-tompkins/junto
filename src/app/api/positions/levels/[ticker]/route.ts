import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { resolveUserId } from '@/lib/positions/levels';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ level: null });
  const { ticker } = await ctx.params;
  const { data } = await getSupabase()
    .from('user_position_levels')
    .select('ticker, stop_price, target_price, notes, updated_at')
    .eq('user_id', userId)
    .eq('ticker', decodeURIComponent(ticker).toUpperCase())
    .maybeSingle();
  return NextResponse.json({ level: data || null });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { ticker: rawTicker } = await ctx.params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();
  const body = await req.json();

  const stop = body.stop_price === '' || body.stop_price === null ? null : Number(body.stop_price);
  const target = body.target_price === '' || body.target_price === null ? null : Number(body.target_price);
  const notes = body.notes === undefined ? null : (body.notes || null);

  if (stop !== null && !Number.isFinite(stop)) return NextResponse.json({ error: 'Invalid stop_price' }, { status: 400 });
  if (target !== null && !Number.isFinite(target)) return NextResponse.json({ error: 'Invalid target_price' }, { status: 400 });

  // Delete row entirely if everything is null
  if (stop === null && target === null && !notes) {
    await getSupabase().from('user_position_levels').delete().eq('user_id', userId).eq('ticker', ticker);
    return NextResponse.json({ level: null });
  }

  const { data, error } = await getSupabase()
    .from('user_position_levels')
    .upsert(
      { user_id: userId, ticker, stop_price: stop, target_price: target, notes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,ticker' },
    )
    .select('ticker, stop_price, target_price, notes, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ level: data });
}
