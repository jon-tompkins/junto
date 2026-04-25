import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const supabase = getSupabase();

    // Resolve current user id (optional — used to surface their private juntos too)
    let userId: string | null = null;
    if (session?.user) {
      if ((session.user as any).twitterId) {
        const { data } = await supabase.from('users').select('id').eq('twitter_id', (session.user as any).twitterId).single();
        userId = data?.id || null;
      } else if ((session.user as any).googleId) {
        const { data } = await supabase.from('users').select('id').eq('google_id', (session.user as any).googleId).single();
        userId = data?.id || null;
      }
    }

    // Fetch public juntos (+ user's own if logged in)
    let query = supabase
      .from('juntos')
      .select(`
        id, name, description, owner_id, is_public, created_at,
        junto_sources(count),
        newsletters_v2(id, name, subscriber_count, schedule_cadence)
      `)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`is_public.eq.true,owner_id.eq.${userId}`);
    } else {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const juntos = (data || []).map((j: any) => ({
      id: j.id,
      name: j.name,
      description: j.description,
      owner_id: j.owner_id,
      is_public: j.is_public,
      created_at: j.created_at,
      is_own: j.owner_id === userId,
      source_count: j.junto_sources?.[0]?.count ?? 0,
      dispatches: (j.newsletters_v2 || []).map((n: any) => ({
        id: n.id,
        name: n.name,
        subscriber_count: n.subscriber_count,
        schedule_cadence: n.schedule_cadence,
      })),
    }));

    return NextResponse.json({ juntos });
  } catch (error) {
    console.error('[GET /api/juntos/public]', error);
    return NextResponse.json({ error: 'Failed to fetch juntos' }, { status: 500 });
  }
}
