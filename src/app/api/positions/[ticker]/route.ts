import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();
  const supabase = getSupabase();

  const { data: profiles, error } = await supabase
    .from('source_analyst_profiles')
    .select('source_id, positions, source:sources(handle_or_url, display_name, avatar_url)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const analysts: Array<{
    source_id: string;
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
    stance: string;
    note?: string;
    since: string;
    target_price?: number;
    entry_price?: number;
  }> = [];

  const breakdown = { bullish: 0, bearish: 0, cautious: 0, neutral: 0 };

  for (const profile of profiles || []) {
    const positions = profile.positions as Record<string, any> || {};
    const matchKey = Object.keys(positions).find((k) => k.toUpperCase() === ticker);
    if (!matchKey) continue;

    const pos = positions[matchKey];
    const stance = pos.stance as keyof typeof breakdown;
    if (stance in breakdown) breakdown[stance]++;

    const src = profile.source as any;
    analysts.push({
      source_id: profile.source_id,
      handle: src?.handle_or_url ?? '',
      display_name: src?.display_name ?? null,
      avatar_url: src?.avatar_url ?? null,
      stance: pos.stance,
      note: pos.note,
      since: pos.since,
      target_price: pos.target_price,
      entry_price: pos.entry_price,
    });
  }

  const stanceOrder: Record<string, number> = { bullish: 0, cautious: 1, neutral: 2, bearish: 3 };
  analysts.sort(
    (a, b) =>
      (stanceOrder[a.stance] ?? 4) - (stanceOrder[b.stance] ?? 4) ||
      new Date(a.since).getTime() - new Date(b.since).getTime(),
  );

  return NextResponse.json({ ticker, total: analysts.length, breakdown, analysts });
}
