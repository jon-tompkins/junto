import { getSupabase } from './client';

export interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;  // ISO date string
  note?: string;
  target_price?: number;
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

// Returns Twitter sources that have stored tweets but no analyst profile yet.
// Used by collect-twitter to seed profiles in background after each poll cycle.
export async function getSourcesMissingProfiles(): Promise<Array<{ id: string; handle_or_url: string }>> {
  const supabase = getSupabase();

  // All source_ids that already have a profile
  const { data: existing } = await supabase
    .from('source_analyst_profiles')
    .select('source_id');
  const existingIds = new Set((existing || []).map((r: any) => r.source_id));

  // Distinct source_ids that have tweets — content_twitter is twitter-only by definition
  const { data: active } = await supabase
    .from('content_twitter')
    .select('source_id')
    .limit(1000);

  const missingIds = [...new Set((active || []).map((r: any) => r.source_id as string))]
    .filter((id) => !existingIds.has(id));

  if (missingIds.length === 0) return [];

  // Resolve handles from sources table
  const { data: sources } = await supabase
    .from('sources')
    .select('id, handle_or_url')
    .in('id', missingIds);

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
