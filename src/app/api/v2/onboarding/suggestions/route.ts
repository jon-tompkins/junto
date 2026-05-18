import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// GET /api/v2/onboarding/suggestions?sourceIds=a,b,c
// Returns up to 3 public dispatches whose junto shares at least 1 source with the given list.
export async function GET(req: NextRequest) {
  try {
    const param = req.nextUrl.searchParams.get('sourceIds') || '';
    const sourceIds = param.split(',').map(s => s.trim()).filter(Boolean);
    if (sourceIds.length === 0) return NextResponse.json({ dispatches: [] });

    const supabase = getSupabase();

    // Find juntos that contain any of these sources
    const { data: juntoRows } = await supabase
      .from('junto_sources')
      .select('junto_id, source_id')
      .in('source_id', sourceIds);

    if (!juntoRows || juntoRows.length === 0) return NextResponse.json({ dispatches: [] });

    // Count overlap per junto
    const overlapByJunto: Record<string, { juntoId: string; sourceIds: Set<string> }> = {};
    for (const row of juntoRows) {
      if (!overlapByJunto[row.junto_id]) {
        overlapByJunto[row.junto_id] = { juntoId: row.junto_id, sourceIds: new Set() };
      }
      overlapByJunto[row.junto_id].sourceIds.add(row.source_id);
    }

    const juntoIds = Object.keys(overlapByJunto);

    // Find public dispatches using those juntos
    const { data: newsletters } = await supabase
      .from('newsletters_v2')
      .select('id, name, description, subscriber_count, junto_id')
      .eq('is_public', true)
      .in('junto_id', juntoIds)
      .limit(10);

    if (!newsletters || newsletters.length === 0) return NextResponse.json({ dispatches: [] });

    // Sort by overlap count desc, cap at 3
    const results = newsletters
      .map((nl: any) => ({
        id: nl.id,
        name: nl.name,
        description: nl.description,
        subscriber_count: nl.subscriber_count,
        junto_id: nl.junto_id,
        overlap: overlapByJunto[nl.junto_id]?.sourceIds.size ?? 0,
      }))
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3);

    return NextResponse.json({ dispatches: results });
  } catch (err) {
    console.error('[GET /api/v2/onboarding/suggestions]', err);
    return NextResponse.json({ dispatches: [] });
  }
}
