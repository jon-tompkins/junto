import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getJunto, addSourceToJunto, removeSourceFromJunto } from '@/lib/db/juntos';

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

async function authorize(req: NextRequest, id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const junto = await getJunto(id);
  if (!junto) {
    return { error: NextResponse.json({ error: 'Junto not found' }, { status: 404 }) };
  }
  const userId = await resolveUserId(session);
  if (!userId || junto.owner_id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { junto };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorize(req, id);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const { source_id } = body;
    if (!source_id) {
      return NextResponse.json({ error: 'source_id required' }, { status: 400 });
    }

    // Enforce 20-source cap per junto
    const supabase = getSupabase();
    const { count } = await supabase
      .from('junto_sources')
      .select('id', { count: 'exact', head: true })
      .eq('junto_id', id);
    if ((count ?? 0) >= 20) {
      return NextResponse.json({ error: 'Junto is at the 20-source limit' }, { status: 422 });
    }

    await addSourceToJunto(id, source_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/juntos/[id]/sources]', error);
    return NextResponse.json({ error: 'Failed to add source' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorize(req, id);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const { source_id } = body;
    if (!source_id) {
      return NextResponse.json({ error: 'source_id required' }, { status: 400 });
    }

    await removeSourceFromJunto(id, source_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/juntos/[id]/sources]', error);
    return NextResponse.json({ error: 'Failed to remove source' }, { status: 500 });
  }
}
