import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllProfilesWithSources } from '@/lib/db/source-analyst-profiles';
import { getSupabase } from '@/lib/db/client';

async function resolveIsPro(session: any): Promise<boolean> {
  const supabase = getSupabase();
  const twitterId = session?.user?.twitterId;
  const googleId = session?.user?.googleId;
  let query = supabase.from('users').select('is_pro');
  if (twitterId) query = query.eq('twitter_id', twitterId);
  else if (googleId) query = query.eq('google_id', googleId);
  else return false;
  const { data } = await query.single();
  return data?.is_pro ?? false;
}

export async function GET() {
  try {
    const profiles = await getAllProfilesWithSources();
    return NextResponse.json({ profiles });
  } catch (err) {
    console.error('[api/sources]', err);
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
  }
}

// POST /api/sources — upsert a source by handle (twitter) or url (youtube/newsletter)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const { handle, url, type } = body as { handle?: string; url?: string; type?: string };

    const supabase = getSupabase();

    // URL-based sources: youtube or newsletter
    if (type === 'youtube' || type === 'newsletter') {
      if (!url || typeof url !== 'string' || !url.trim()) {
        return NextResponse.json({ error: 'url is required' }, { status: 400 });
      }
      const cleanUrl = url.trim();

      const { data: existing } = await supabase
        .from('sources')
        .select('id, handle_or_url, display_name, avatar_url, type')
        .eq('handle_or_url', cleanUrl)
        .eq('type', type)
        .single();

      if (existing) return NextResponse.json(existing);

      // New source — requires Pro
      const isPro = await resolveIsPro(session);
      if (!isPro) {
        return NextResponse.json({ error: 'pro_required', message: 'Adding new sources requires a Pro account' }, { status: 403 });
      }

      const { data, error } = await supabase
        .from('sources')
        .insert({ handle_or_url: cleanUrl, type, is_active: true })
        .select('id, handle_or_url, display_name, avatar_url, type')
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Default: Twitter source by handle
    if (!handle || typeof handle !== 'string') {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    const clean = handle.toLowerCase().replace('@', '').trim();
    if (!clean) return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });

    const { data: existing } = await supabase
      .from('sources')
      .select('id, handle_or_url, display_name, avatar_url, type')
      .eq('handle_or_url', clean)
      .eq('type', 'twitter')
      .single();

    if (existing) return NextResponse.json(existing);

    // New source — requires Pro
    const isPro = await resolveIsPro(session);
    if (!isPro) {
      return NextResponse.json({ error: 'pro_required', message: 'Adding new accounts requires a Pro account' }, { status: 403 });
    }

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
