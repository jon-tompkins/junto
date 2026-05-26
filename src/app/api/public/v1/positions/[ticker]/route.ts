import { NextRequest, NextResponse } from 'next/server';
import { withApiKey } from '@/lib/api-auth';
import { getSupabase } from '@/lib/db/client';

interface SourceStance {
  handle: string;
  display_name: string | null;
  stance: string;
  since: string;
  note?: string;
}

export const GET = (req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) =>
  withApiKey('GET /positions/:ticker', 'position_consensus', async () => {
    const { ticker: rawTicker } = await params;
    const ticker = rawTicker.toUpperCase();

    // Pull every analyst profile and aggregate sources that have a position on
    // this ticker. positions is JSONB so we filter in JS (corpus is small).
    const { data, error } = await getSupabase()
      .from('source_analyst_profiles')
      .select('positions, source:sources(handle_or_url, display_name)');
    if (error) throw error;

    const sources: SourceStance[] = [];
    for (const row of data || []) {
      const positions = (row as any).positions || {};
      const matchKey = Object.keys(positions).find((k) => k.toUpperCase() === ticker);
      if (!matchKey) continue;
      const p = positions[matchKey];
      const source = (row as any).source;
      if (!source) continue;
      sources.push({
        handle: source.handle_or_url,
        display_name: source.display_name,
        stance: p.stance,
        since: p.since,
        ...(p.note ? { note: p.note } : {}),
      });
    }

    const counts = sources.reduce<Record<string, number>>((acc, s) => {
      acc[s.stance] = (acc[s.stance] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ticker,
      source_count: sources.length,
      counts,
      sources: sources.sort((a, b) => a.since.localeCompare(b.since)),
    });
  })(req);
