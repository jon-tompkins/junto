import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createJunto, getUserJuntos } from '@/lib/db/juntos';

async function resolveUser(session: any): Promise<{ id: string; handle: string | null } | null> {
  const supabase = getSupabase();
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;
  if (twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id, twitter_handle, featured_junto_id')
      .eq('twitter_id', twitterId)
      .single();
    return data ? { id: data.id, handle: data.twitter_handle } : null;
  }
  if (googleId) {
    const { data } = await supabase
      .from('users')
      .select('id, twitter_handle, featured_junto_id')
      .eq('google_id', googleId)
      .single();
    return data ? { id: data.id, handle: data.twitter_handle } : null;
  }
  return null;
}

async function getFeaturedJuntoId(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('users')
    .select('featured_junto_id')
    .eq('id', userId)
    .single();
  return data?.featured_junto_id ?? null;
}

async function getJuntoWithSources(juntoId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('juntos')
    .select(`
      id, name, description, is_public, owner_id, created_at,
      junto_sources(
        id, source_id, added_at,
        source:sources(id, handle_or_url, display_name, avatar_url, type)
      )
    `)
    .eq('id', juntoId)
    .single();
  if (error || !data) return null;

  // Enrich each source with its last tweet date
  const junto = data as any;
  const sourceIds = (junto.junto_sources || []).map((js: any) => js.source_id);
  if (sourceIds.length > 0) {
    const { data: tweets } = await supabase
      .from('content_twitter')
      .select('source_id, posted_at')
      .in('source_id', sourceIds)
      .order('posted_at', { ascending: false });

    const lastTweetBySource: Record<string, string> = {};
    for (const t of tweets || []) {
      if (!lastTweetBySource[t.source_id]) lastTweetBySource[t.source_id] = t.posted_at;
    }
    for (const js of junto.junto_sources) {
      js.last_tweeted_at = lastTweetBySource[js.source_id] ?? null;
    }
  }
  return junto;
}

// GET /api/v2/featured-junto
// Returns the featured junto with sources. Auto-creates one if none is set.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const supabase = getSupabase();
    let juntoId = await getFeaturedJuntoId(user.id);

    // Auto-create a personal junto if none is set
    if (!juntoId) {
      const label = user.handle ? `${user.handle}'s Junto` : 'My Junto';
      const newJunto = await createJunto(label, 'Your personal signal layer.', user.id, false);
      juntoId = newJunto.id;
      await supabase
        .from('users')
        .update({ featured_junto_id: juntoId })
        .eq('id', user.id);
    }

    const junto = await getJuntoWithSources(juntoId);
    if (!junto) return NextResponse.json({ error: 'Junto not found' }, { status: 404 });

    // Also return all juntos owned by this user for the "change" picker
    const allJuntos = await getUserJuntos(user.id);

    // Plus public juntos (capped) so users can pick a community junto as primary
    const { data: publicJuntoRows } = await supabase
      .from('juntos')
      .select('id, name, owner_id')
      .eq('is_public', true)
      .neq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const publicJuntos = (publicJuntoRows || []).map((j: any) => ({ id: j.id, name: j.name }));

    return NextResponse.json({ junto, allJuntos, publicJuntos });
  } catch (err) {
    console.error('[GET /api/v2/featured-junto]', err);
    return NextResponse.json({ error: 'Failed to load featured junto' }, { status: 500 });
  }
}

// PUT /api/v2/featured-junto
// Body: { juntoId: string }
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { juntoId } = await req.json();
    if (!juntoId) return NextResponse.json({ error: 'juntoId required' }, { status: 400 });

    const supabase = getSupabase();

    // Verify junto exists and is accessible (owned by user or public)
    const { data: junto } = await supabase
      .from('juntos')
      .select('id, owner_id, is_public')
      .eq('id', juntoId)
      .single();

    if (!junto) return NextResponse.json({ error: 'Junto not found' }, { status: 404 });
    if (junto.owner_id !== user.id && !junto.is_public) {
      return NextResponse.json({ error: 'Cannot feature a private junto you do not own' }, { status: 403 });
    }

    await supabase.from('users').update({ featured_junto_id: juntoId }).eq('id', user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/v2/featured-junto]', err);
    return NextResponse.json({ error: 'Failed to update featured junto' }, { status: 500 });
  }
}
