import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getSourceHitRatesForTicker } from '@/lib/db/source-analyst-profiles';

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
    last_mentioned?: string;
    target_price?: number;
    entry_price?: number;
    track_record?: { wins: number; losses: number; scored: number; avg_return_pct: number | null };
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
      last_mentioned: pos.last_mentioned,
      target_price: pos.target_price,
      entry_price: pos.entry_price,
    });
  }

  // Per-ticker track record for each source that holds a stance here.
  const rates = await getSourceHitRatesForTicker(analysts.map((a) => a.source_id), ticker);
  for (const a of analysts) {
    const r = rates.get(a.source_id);
    if (r && r.total > 0) {
      a.track_record = { wins: r.wins, losses: r.losses, scored: r.scored, avg_return_pct: r.avg_return_pct };
    }
  }

  const stanceOrder: Record<string, number> = { bullish: 0, cautious: 1, neutral: 2, bearish: 3 };
  analysts.sort(
    (a, b) =>
      (stanceOrder[a.stance] ?? 4) - (stanceOrder[b.stance] ?? 4) ||
      new Date(a.since).getTime() - new Date(b.since).getTime(),
  );

  // Closed-call history for this ticker across all sources (realized receipts).
  // ilike = case-insensitive exact match (tickers stored as 'AMD', themes lower).
  const { data: outcomes } = await supabase
    .from('source_call_outcomes')
    .select('source_id, stance, outcome, return_pct, entry_price, exit_price, entry_date, exit_date, close_reason, source:sources(handle_or_url, display_name, avatar_url)')
    .ilike('ticker', ticker)
    .order('exit_date', { ascending: false, nullsFirst: false });
  const closedCalls = (outcomes || []).map((o: any) => ({
    source_id: o.source_id,
    handle: o.source?.handle_or_url ?? '',
    display_name: o.source?.display_name ?? null,
    avatar_url: o.source?.avatar_url ?? null,
    stance: o.stance,
    outcome: o.outcome,
    return_pct: o.return_pct,
    entry_price: o.entry_price,
    exit_price: o.exit_price,
    entry_date: o.entry_date,
    exit_date: o.exit_date,
    close_reason: o.close_reason,
  }));

  return NextResponse.json({ ticker, total: analysts.length, breakdown, analysts, closedCalls });
}
