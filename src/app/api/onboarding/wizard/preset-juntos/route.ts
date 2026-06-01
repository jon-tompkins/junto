import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// GET /api/onboarding/wizard/preset-juntos?interests=crypto,equities
// Returns public juntos whose interest_tags overlap with any of the
// requested buckets, plus a source-count for sorting / display.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('interests') || '';
  const interests = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (interests.length === 0) {
    return NextResponse.json({ juntos: [] });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('juntos')
    .select('id, name, description, interest_tags, junto_sources(count)')
    .eq('is_public', true)
    .overlaps('interest_tags', interests);

  if (error) {
    console.error('[wizard/preset-juntos]', error);
    return NextResponse.json({ juntos: [] });
  }

  const juntos = (data || [])
    .map((j: any) => ({
      id: j.id,
      name: j.name,
      description: j.description,
      interest_tags: j.interest_tags || [],
      source_count: j.junto_sources?.[0]?.count ?? 0,
    }))
    .sort((a, b) => b.source_count - a.source_count);

  return NextResponse.json({ juntos });
}
