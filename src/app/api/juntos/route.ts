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
    return NextResponse.json({ juntos });
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

    const junto = await createJunto(name, description ?? null, userId, is_public ?? true);

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
