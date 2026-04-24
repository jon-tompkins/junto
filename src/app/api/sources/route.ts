import { NextRequest, NextResponse } from 'next/server';
import { getAllProfilesWithSources } from '@/lib/db/source-analyst-profiles';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  try {
    const profiles = await getAllProfilesWithSources();
    return NextResponse.json({ profiles });
  } catch (err) {
    console.error('[api/sources]', err);
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
  }
}

// POST /api/sources — upsert a Twitter source by handle, return the row
export async function POST(req: NextRequest) {
  try {
    const { handle } = await req.json();
    if (!handle || typeof handle !== 'string') {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    const clean = handle.toLowerCase().replace('@', '').trim();
    if (!clean) return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });

    const supabase = getSupabase();

    // Return existing source if already in DB
    const { data: existing } = await supabase
      .from('sources')
      .select('id, handle_or_url, display_name, avatar_url, type')
      .eq('handle_or_url', clean)
      .eq('type', 'twitter')
      .single();

    if (existing) return NextResponse.json(existing);

    // Create new source — display_name and avatar_url will be populated on first content pull
    const { data, error } = await supabase
      .from('sources')
      .insert({ handle_or_url: clean, type: 'twitter', is_active: true })
      .select('id, handle_or_url, display_name, avatar_url, type')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[POST /api/sources]', err);
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
  }
}
