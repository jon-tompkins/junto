import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { resolveUserId } from '@/lib/positions/levels';

export async function GET() {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ levels: [] });
  const { data, error } = await getSupabase()
    .from('user_position_levels')
    .select('ticker, stop_price, target_price, notes, updated_at')
    .eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ levels: data || [] });
}
