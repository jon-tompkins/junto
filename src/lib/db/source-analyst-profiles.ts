import { getSupabase } from './client';

export interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;           // ISO date — when this stance was first taken; never changes on confirmation
  last_mentioned?: string; // ISO date — last time a tweet confirmed or updated this position
  mentions?: number;       // mechanical running count of raw-text mentions (cashtag/name), watermarked off last_mentioned so re-scans don't double-count. Frequency signal, distinct from conviction (strength)
  conviction?: number;     // 1–5; the model's judged strength of the view (NOT a mention counter)
  note?: string;
  target_price?: number;
  entry_price?: number;
  aliases?: string[];      // common/full names (e.g. ["BlackBerry"] for BB) — used to
                           // detect raw-text mentions (incl. retweets) for staleness
  asset_class?: 'equity' | 'crypto' | 'sector'; // equity/crypto = tradeable single
                           // name; sector = theme/concept ("AI", "biotech")
}

export interface CallOutcome {
  source_id: string;
  ticker: string;
  stance: PositionEntry['stance'];
  entry_price: number | null;
  entry_date: string | null;
  exit_price: number | null;
  return_pct: number | null;
  outcome: 'win' | 'loss' | 'flat' | 'unscored';
  close_reason: 'flip' | 'dropped' | 'stale';
}

// Append-only: records the outcome of a call at the moment it closes (stance
// flip, drop, or stale-out). Best-effort — a logging failure must never break
// profile synthesis, so callers swallow errors.
export async function recordCallOutcomes(rows: CallOutcome[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('source_call_outcomes').insert(rows);
  if (error) throw error;
}

export interface SourceHitRate {
  source_id: string;
  total: number;
  scored: number;
  wins: number;
  losses: number;
  avg_return_pct: number | null;
}

// Aggregate closed-call hit rate for a source. Only directional calls
// (outcome win/loss) count toward the rate; 'unscored'/'flat' are excluded
// from wins/losses but still inform avg return where a return exists.
export async function getSourceHitRate(sourceId: string): Promise<SourceHitRate> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('source_call_outcomes')
    .select('outcome, return_pct')
    .eq('source_id', sourceId);
  if (error || !data) return { source_id: sourceId, total: 0, scored: 0, wins: 0, losses: 0, avg_return_pct: null };

  let wins = 0;
  let losses = 0;
  let retSum = 0;
  let retCount = 0;
  for (const r of data as { outcome: string; return_pct: number | null }[]) {
    if (r.outcome === 'win') wins += 1;
    else if (r.outcome === 'loss') losses += 1;
    if (r.return_pct != null) {
      retSum += Number(r.return_pct);
      retCount += 1;
    }
  }
  return {
    source_id: sourceId,
    total: data.length,
    scored: wins + losses,
    wins,
    losses,
    avg_return_pct: retCount > 0 ? retSum / retCount : null,
  };
}

// Per-ticker hit rate for many sources at once. One query scoped to the given
// ticker + source ids, aggregated per source. Used by the asset page to show
// each source's track record *on this specific asset* (vs. their overall rate).
export async function getSourceHitRatesForTicker(
  sourceIds: string[],
  ticker: string,
): Promise<Map<string, SourceHitRate>> {
  const out = new Map<string, SourceHitRate>();
  if (sourceIds.length === 0) return out;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('source_call_outcomes')
    .select('source_id, outcome, return_pct')
    .in('source_id', sourceIds)
    .ilike('ticker', ticker);
  if (error || !data) return out;

  type Acc = { total: number; wins: number; losses: number; retSum: number; retCount: number };
  const acc = new Map<string, Acc>();
  for (const r of data as { source_id: string; outcome: string; return_pct: number | null }[]) {
    const a = acc.get(r.source_id) || { total: 0, wins: 0, losses: 0, retSum: 0, retCount: 0 };
    a.total += 1;
    if (r.outcome === 'win') a.wins += 1;
    else if (r.outcome === 'loss') a.losses += 1;
    if (r.return_pct != null) {
      a.retSum += Number(r.return_pct);
      a.retCount += 1;
    }
    acc.set(r.source_id, a);
  }
  for (const [sourceId, a] of acc) {
    out.set(sourceId, {
      source_id: sourceId,
      total: a.total,
      scored: a.wins + a.losses,
      wins: a.wins,
      losses: a.losses,
      avg_return_pct: a.retCount > 0 ? a.retSum / a.retCount : null,
    });
  }
  return out;
}

export interface SourceAnalystProfile {
  id: string;
  source_id: string;
  summary: string | null;
  positions: Record<string, PositionEntry>;
  last_updated: string;
  created_at: string;
}

export interface SourceProfileWithSource extends SourceAnalystProfile {
  source: {
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
    type: string;
  };
}

export async function getSourceProfile(sourceId: string): Promise<SourceAnalystProfile | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('source_analyst_profiles')
    .select('*')
    .eq('source_id', sourceId)
    .single();

  if (error?.code === 'PGRST116') return null; // not found
  if (error) throw error;
  return data as SourceAnalystProfile;
}

export async function upsertSourceProfile(
  sourceId: string,
  summary: string | null,
  positions: Record<string, PositionEntry>,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('source_analyst_profiles')
    .upsert(
      {
        source_id: sourceId,
        summary,
        positions,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'source_id' },
    );

  if (error) throw error;

  // Dual-write the normalized per-row table (source_positions). The blob above is
  // still the compatibility cache every existing reader uses; this table is the
  // queryable per-row store. Best-effort — a sync failure must never break the
  // primary profile write or synthesis.
  try {
    await syncSourcePositions(sourceId, positions);
  } catch (err) {
    console.warn(
      `[source-positions] sync failed for ${sourceId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// Mirror a source's positions map into the normalized source_positions table:
// upsert every current position as a row, delete rows for tickers no longer held.
async function syncSourcePositions(
  sourceId: string,
  positions: Record<string, PositionEntry>,
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const tickers = Object.keys(positions);

  if (tickers.length > 0) {
    const rows = tickers.map((ticker) => {
      const p = positions[ticker];
      return {
        source_id: sourceId,
        ticker,
        stance: p.stance,
        since: p.since ?? null,
        last_mentioned: p.last_mentioned ?? null,
        mentions: p.mentions ?? 0,
        conviction: p.conviction ?? null,
        note: p.note ?? null,
        entry_price: p.entry_price ?? null,
        target_price: p.target_price ?? null,
        aliases: p.aliases ?? null,
        asset_class: p.asset_class ?? null,
        updated_at: now,
      };
    });
    const { error: upErr } = await supabase
      .from('source_positions')
      .upsert(rows, { onConflict: 'source_id,ticker' });
    if (upErr) throw upErr;
  }

  // Delete any rows for tickers this source no longer holds (dropped / stale-dropped).
  const { data: existingRows, error: selErr } = await supabase
    .from('source_positions')
    .select('ticker')
    .eq('source_id', sourceId);
  if (selErr) throw selErr;

  const current = new Set(tickers);
  const removed = (existingRows ?? []).map((r) => r.ticker).filter((t) => !current.has(t));
  if (removed.length > 0) {
    const { error: delErr } = await supabase
      .from('source_positions')
      .delete()
      .eq('source_id', sourceId)
      .in('ticker', removed);
    if (delErr) throw delErr;
  }
}

/**
 * Cross-source query (the payoff of normalization): every source currently holding
 * a position on a ticker, with stance/conviction/mentions. Powers "who's bullish on
 * $NVDA", the leaderboard, and portfolio rollups without scanning JSON blobs.
 */
export async function getPositionsForTicker(ticker: string): Promise<Array<{
  source_id: string;
  ticker: string;
  stance: string;
  conviction: number | null;
  mentions: number;
  last_mentioned: string | null;
}>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('source_positions')
    .select('source_id, ticker, stance, conviction, mentions, last_mentioned')
    .ilike('ticker', ticker)
    .order('conviction', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Array<{ source_id: string; ticker: string; stance: string; conviction: number | null; mentions: number; last_mentioned: string | null }>;
}

// Returns Twitter sources that have stored tweets but no analyst profile yet,
// plus sources whose profile hasn't been re-analyzed in >48h.
// Used by collect-twitter to seed/refresh profiles in background after each poll cycle.
export async function getSourcesMissingOrStaleProfiles(): Promise<Array<{ id: string; handle_or_url: string }>> {
  const supabase = getSupabase();

  const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from('source_analyst_profiles')
    .select('source_id, last_updated');

  const existingIds = new Set<string>();
  const staleIds = new Set<string>();
  for (const r of existing || []) {
    existingIds.add(r.source_id);
    if (r.last_updated < staleThreshold) staleIds.add(r.source_id);
  }

  const { data: active } = await supabase
    .from('content_twitter')
    .select('source_id')
    .limit(1000);

  const targetIds = [...new Set((active || []).map((r: any) => r.source_id as string))].filter(
    (id) => !existingIds.has(id) || staleIds.has(id),
  );

  if (targetIds.length === 0) return [];

  const { data: sources } = await supabase
    .from('sources')
    .select('id, handle_or_url')
    .in('id', targetIds);

  return (sources || []).map((s: any) => ({ id: s.id, handle_or_url: s.handle_or_url }));
}

export async function getAllProfilesWithSources(): Promise<SourceProfileWithSource[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('source_analyst_profiles')
    .select(`
      *,
      source:sources(handle_or_url, display_name, avatar_url, type)
    `)
    .order('last_updated', { ascending: false });

  if (error) throw error;
  return (data || []) as SourceProfileWithSource[];
}

export async function getProfileByHandle(handle: string): Promise<SourceProfileWithSource | null> {
  const supabase = getSupabase();
  const cleanHandle = handle.toLowerCase().replace('@', '');

  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .select('id')
    .eq('handle_or_url', cleanHandle)
    .single();

  if (sourceError?.code === 'PGRST116') return null;
  if (sourceError) throw sourceError;

  const { data, error } = await supabase
    .from('source_analyst_profiles')
    .select(`
      *,
      source:sources(handle_or_url, display_name, avatar_url, type)
    `)
    .eq('source_id', source.id)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data as SourceProfileWithSource;
}
