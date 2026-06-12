import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createJunto, getUserJuntos, addSourceToJunto } from '@/lib/db/juntos';

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ juntos: [] });

    const juntos = await getUserJuntos(userId);
    const supabase = getSupabase();

    // Enrich with source details for profile filtering / "see who"
    const juntoIds = juntos.map((j: any) => j.id);
    const sourcesByJunto: Record<string, any[]> = {};
    if (juntoIds.length > 0) {
      const { data: jSources } = await supabase
        .from('junto_sources')
        .select('junto_id, source_id')
        .in('junto_id', juntoIds);

      const allSourceIds = [...new Set((jSources || []).map((r: any) => r.source_id))];
      const sourceDetailsMap: Record<string, any> = {};
      if (allSourceIds.length > 0) {
        const { data: sourceDeets } = await supabase
          .from('sources')
          .select('id, handle_or_url, display_name, avatar_url, type')
          .in('id', allSourceIds);
        (sourceDeets || []).forEach((s: any) => { sourceDetailsMap[s.id] = s; });
      }

      (jSources || []).forEach((r: any) => {
        if (!sourcesByJunto[r.junto_id]) sourcesByJunto[r.junto_id] = [];
        const detail = sourceDetailsMap[r.source_id];
        if (detail) sourcesByJunto[r.junto_id].push(detail);
      });
    }

    const enriched = juntos.map((j: any) => ({
      ...j,
      sources: sourcesByJunto[j.id] ?? [],
    }));

    return NextResponse.json({ juntos: enriched });
  } catch (error) {
    console.error('[GET /api/juntos]', error);
    return NextResponse.json({ error: 'Failed to fetch juntos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, is_public, source_ids } = body;
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const junto = await createJunto(name, description ?? null, userId, is_public ?? false);

    if (Array.isArray(source_ids) && source_ids.length > 0) {
      for (const sid of source_ids) {
        await addSourceToJunto(junto.id, sid);
      }
    }

    return NextResponse.json({ junto }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/juntos]', error);
    return NextResponse.json({ error: 'Failed to create junto' }, { status: 500 });
  }
}
