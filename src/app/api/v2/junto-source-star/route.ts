import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createJunto, addSourceToJunto, removeSourceFromJunto } from '@/lib/db/juntos';

async function resolveUserId(session: { user?: { twitterId?: string; googleId?: string } }): Promise<string | null> {
  const supabase = getSupabase();
  if (session.user?.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', session.user.twitterId).single();
    return data?.id || null;
  }
  if (session.user?.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', session.user.googleId).single();
    return data?.id || null;
  }
  return null;
}

async function getOrCreatePrimaryJuntoId(userId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: user } = await supabase
    .from('users')
    .select('featured_junto_id')
    .eq('id', userId)
    .single();

  if (user?.featured_junto_id) return user.featured_junto_id;

  const newJunto = await createJunto('My Junto', null, userId, false);
  await supabase.from('users').update({ featured_junto_id: newJunto.id }).eq('id', userId);
  return newJunto.id;
}

// GET /api/v2/junto-source-star?source_id=XXX — { starred: boolean }
// GET /api/v2/junto-source-star              — { source_ids: string[] }
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      const sourceId = req.nextUrl.searchParams.get('source_id');
      return NextResponse.json(sourceId ? { starred: false } : { source_ids: [] });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      const sourceId = req.nextUrl.searchParams.get('source_id');
      return NextResponse.json(sourceId ? { starred: false } : { source_ids: [] });
    }

    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('featured_junto_id')
      .eq('id', userId)
      .single();

    const juntoId = user?.featured_junto_id;
    if (!juntoId) {
      const sourceId = req.nextUrl.searchParams.get('source_id');
      return NextResponse.json(sourceId ? { starred: false } : { source_ids: [] });
    }

    const { data: rows } = await supabase
      .from('junto_sources')
      .select('source_id')
      .eq('junto_id', juntoId);

    const sourceIds = (rows || []).map((r: { source_id: string }) => r.source_id);

    const sourceId = req.nextUrl.searchParams.get('source_id');
    if (sourceId) {
      return NextResponse.json({ starred: sourceIds.includes(sourceId) });
    }
    return NextResponse.json({ source_ids: sourceIds });
  } catch (error) {
    console.error('[GET /api/v2/junto-source-star]', error);
    const sourceId = req.nextUrl.searchParams.get('source_id');
    return NextResponse.json(sourceId ? { starred: false } : { source_ids: [] });
  }
}

// POST /api/v2/junto-source-star — { source_id: string }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const { source_id } = await req.json();
    if (!source_id) return NextResponse.json({ error: 'source_id required' }, { status: 400 });

    const juntoId = await getOrCreatePrimaryJuntoId(userId);

    // Enforce 20-source cap
    const supabase = getSupabase();
    const { count } = await supabase
      .from('junto_sources')
      .select('id', { count: 'exact', head: true })
      .eq('junto_id', juntoId);
    if ((count ?? 0) >= 20) {
      return NextResponse.json({ error: 'Junto is at the 20-source limit' }, { status: 422 });
    }

    await addSourceToJunto(juntoId, source_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/v2/junto-source-star]', error);
    return NextResponse.json({ error: 'Failed to star source' }, { status: 500 });
  }
}

// DELETE /api/v2/junto-source-star — { source_id: string }
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const { source_id } = await req.json();
    if (!source_id) return NextResponse.json({ error: 'source_id required' }, { status: 400 });

    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('featured_junto_id')
      .eq('id', userId)
      .single();

    if (!user?.featured_junto_id) return NextResponse.json({ ok: true });

    await removeSourceFromJunto(user.featured_junto_id, source_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/v2/junto-source-star]', error);
    return NextResponse.json({ error: 'Failed to unstar source' }, { status: 500 });
  }
}
