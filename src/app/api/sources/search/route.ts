import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();
    if (!q) return NextResponse.json([]);

    const supabase = getSupabase();
    const escaped = q.replace(/[%_\\]/g, '\\$&');
    const { data, error } = await supabase
      .from('sources')
      .select('id, handle_or_url, display_name, avatar_url, type')
      .eq('type', 'twitter')
      .or(`handle_or_url.ilike.%${escaped}%,display_name.ilike.%${escaped}%`)
      .limit(10);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('[GET /api/sources/search]', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
