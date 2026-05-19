import { getSupabase } from './client';

export interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;           // ISO date — when this stance was first taken; never changes on confirmation
  last_mentioned?: string; // ISO date — last time a tweet confirmed or updated this position
  note?: string;
  target_price?: number;
  entry_price?: number;
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
