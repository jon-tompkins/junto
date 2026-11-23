import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { ROSTER_JUNTO_ID } from '@/lib/trading/hl-roster';
import { analyzeFills, fetchFills } from '@/lib/trading/hl-wallet-pnl';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily: realized P&L per roster wallet from NET-NEW positions only (opened
// after we started following it), written to sources.metadata.since_added.
// Wallets removed in the last few days get one final refresh, then freeze.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  const { data: links } = await supabase.from('junto_sources').select('source_id').eq('junto_id', ROSTER_JUNTO_ID);
  const linked = new Set((links || []).map((l: any) => l.source_id));
  const { data: recent } = await supabase
    .from('sources').select('id, created_at, handle_or_url, metadata')
    .eq('type', 'hyperliquid_wallet').gte('created_at', '2026-10-16');
  const now = Date.now();
  const results: Record<string, unknown> = {};
  for (const s of (recent || []) as any[]) {
    const meta = (s.metadata || {}) as any;
    if (!meta.roster) continue;
    const isLinked = linked.has(s.id);
    const removedAt = meta.removed_at ? new Date(meta.removed_at).getTime() : null;
    const stale = !meta.since_added || (removedAt != null && new Date(meta.since_added.as_of).getTime() < removedAt);
    if (!isLinked && (removedAt == null || !stale)) continue; // removed + finalized (or pre-tracking removals)
    const includedMs = new Date(meta.included_at || s.created_at).getTime();
    try {
      const fills = await fetchFills(s.handle_or_url, includedMs - 60_000);
      const a = analyzeFills(fills, includedMs);
      const since_added = {
        pnl_usd: Math.round(a.netNewPnl), trades: a.netNewTrades, wins: a.netNewWins,
        as_of: new Date(now).toISOString(), truncated: fills.length >= 12000,
      };
      await supabase.from('sources').update({ metadata: { ...meta, included_at: meta.included_at || s.created_at, since_added } }).eq('id', s.id);
      results[s.handle_or_url] = since_added;
    } catch (e) {
      results[s.handle_or_url] = { error: e instanceof Error ? e.message : 'failed' };
    }
  }
  return NextResponse.json({ ok: true, wallets: Object.keys(results).length, results });
}
