import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('newsletters_v2')
      .select('id, name, description, schedule_cadence, subscriber_count, is_public')
      .eq('junto_id', id)
      .eq('is_public', true)
      .order('subscriber_count', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ dispatches: data || [] });
  } catch (error) {
    console.error('[GET /api/juntos/[id]/dispatches]', error);
    return NextResponse.json({ error: 'Failed to fetch dispatches' }, { status: 500 });
  }
}
