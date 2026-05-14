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
      .select('id, name, description, owner_id, is_public, created_at')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`is_public.eq.true,owner_id.eq.${userId}`);
    } else {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const juntoIds = (data || []).map((j: any) => j.id);

    // Fetch source counts + source_ids separately to avoid schema-cache issues
    const sourceCountMap: Record<string, number> = {};
    const sourceIdsMap: Record<string, string[]> = {};
    if (juntoIds.length > 0) {
      const { data: sourceCounts } = await supabase
        .from('junto_sources')
        .select('junto_id, source_id')
        .in('junto_id', juntoIds);
      (sourceCounts || []).forEach((row: any) => {
        sourceCountMap[row.junto_id] = (sourceCountMap[row.junto_id] || 0) + 1;
        if (!sourceIdsMap[row.junto_id]) sourceIdsMap[row.junto_id] = [];
        sourceIdsMap[row.junto_id].push(row.source_id);
      });
    }

    // Fetch source details for avatar icons
    const allSourceIds = [...new Set(Object.values(sourceIdsMap).flat())];
    const sourceDetailsMap: Record<string, { id: string; handle_or_url: string; display_name: string | null; avatar_url: string | null; type: string }> = {};
    if (allSourceIds.length > 0) {
      const { data: sourceDeets } = await supabase
        .from('sources')
        .select('id, handle_or_url, display_name, avatar_url, type')
        .in('id', allSourceIds);
      (sourceDeets || []).forEach((s: any) => { sourceDetailsMap[s.id] = s; });
    }

    const juntos = (data || []).map((j: any) => ({
      id: j.id,
      name: j.name,
      description: j.description,
      owner_id: j.owner_id,
      is_public: j.is_public,
      created_at: j.created_at,
      is_own: j.owner_id === userId,
      source_count: sourceCountMap[j.id] ?? 0,
      sources: (sourceIdsMap[j.id] ?? []).map((sid: string) => sourceDetailsMap[sid]).filter(Boolean),
      dispatches: [],
    }));

    return NextResponse.json({ juntos });
  } catch (error) {
    console.error('[GET /api/juntos/public]', error);
    return NextResponse.json({ error: 'Failed to fetch juntos' }, { status: 500 });
  }
}
