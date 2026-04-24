import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getJuntoWithSources, updateJunto, deleteJunto } from '@/lib/db/juntos';

async function resolveUserId(session: any): Promise<string | null> {
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const junto = await getJuntoWithSources(id);
    if (!junto) {
      return NextResponse.json({ error: 'Junto not found' }, { status: 404 });
    }

    const sourceIds = (junto.junto_sources || [])
      .map((js) => js.source?.id)
      .filter((sid): sid is string => !!sid);

    let profilesBySourceId: Record<string, any> = {};
    if (sourceIds.length > 0) {
      const supabase = getSupabase();
      const { data: profiles } = await supabase
        .from('source_analyst_profiles')
        .select('source_id, summary, positions, last_updated')
        .in('source_id', sourceIds);
      if (profiles) {
        profilesBySourceId = Object.fromEntries(profiles.map((p: any) => [p.source_id, p]));
      }
    }

    const enrichedSources = (junto.junto_sources || []).map((js) => ({
      ...js,
      source: js.source
        ? {
            ...js.source,
            profile: profilesBySourceId[js.source.id] || null,
          }
        : js.source,
    }));

    const session = await getServerSession(authOptions);
    let isOwner = false;
    if (session?.user) {
      const userId = await resolveUserId(session);
      isOwner = !!userId && userId === junto.owner_id;
    }

    return NextResponse.json({
      junto: {
        ...junto,
        junto_sources: enrichedSources,
        is_owner: isOwner,
      },
    });
  } catch (error) {
    console.error('[GET /api/juntos/[id]]', error);
    return NextResponse.json({ error: 'Failed to fetch junto' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const junto = await getJuntoWithSources(id);
    if (!junto) {
      return NextResponse.json({ error: 'Junto not found' }, { status: 404 });
    }
    const userId = await resolveUserId(session);
    if (!userId || junto.owner_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.description === 'string' || body.description === null) updates.description = body.description;
    if (typeof body.is_public === 'boolean') updates.is_public = body.is_public;

    const updated = await updateJunto(id, updates as any);
    return NextResponse.json({ junto: updated });
  } catch (error) {
    console.error('[PATCH /api/juntos/[id]]', error);
    return NextResponse.json({ error: 'Failed to update junto' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const junto = await getJuntoWithSources(id);
    if (!junto) {
      return NextResponse.json({ error: 'Junto not found' }, { status: 404 });
    }
    const userId = await resolveUserId(session);
    if (!userId || junto.owner_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteJunto(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/juntos/[id]]', error);
    return NextResponse.json({ error: 'Failed to delete junto' }, { status: 500 });
  }
}
