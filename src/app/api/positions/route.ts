import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export interface PositionGroup {
  ticker: string;
  stance: string;
  count: number;
  sources: Array<{ handle: string; display_name: string | null }>;
}

export async function GET() {
  const supabase = getSupabase();

  const { data: profiles, error } = await supabase
    .from('source_analyst_profiles')
    .select('positions, source:sources(handle_or_url, display_name)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate: ticker+stance → { count, sources }
  const groups: Record<string, PositionGroup> = {};

  for (const profile of profiles || []) {
    const positions = (profile.positions as Record<string, any>) || {};
    const src = profile.source as any;
    const handle = src?.handle_or_url ?? '';
    const display_name = src?.display_name ?? null;

    for (const [ticker, pos] of Object.entries(positions)) {
      const stance = (pos as any).stance as string;
      if (!stance) continue;
      const key = `${ticker.toUpperCase()}::${stance}`;
      if (!groups[key]) {
        groups[key] = { ticker: ticker.toUpperCase(), stance, count: 0, sources: [] };
      }
      groups[key].count += 1;
      groups[key].sources.push({ handle, display_name });
    }
  }

  const items = Object.values(groups).sort((a, b) => b.count - a.count);

  return NextResponse.json({ items });
}
