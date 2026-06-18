import { getSupabase } from './client';
import { getSourceHitRate, type SourceHitRate } from './source-analyst-profiles';

export interface CreatorEntity {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkedSource {
  id: string;
  type: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  creator_entity_id: string | null;
}

export interface CreatorEntityWithSources extends CreatorEntity {
  sources: LinkedSource[];
}

const SOURCE_BRIEF = 'id, type, handle_or_url, display_name, avatar_url, creator_entity_id';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'creator';
}

async function uniqueSlug(base: string): Promise<string> {
  const supabase = getSupabase();
  let slug = base;
  let n = 1;
  // Bounded probing — collisions are rare.
  while (n < 50) {
    const { data } = await supabase.from('creator_entities').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function listCreatorEntities(): Promise<CreatorEntityWithSources[]> {
  const supabase = getSupabase();
  const { data: entities, error } = await supabase
    .from('creator_entities')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  if (!entities || entities.length === 0) return [];

  const ids = entities.map((e) => e.id);
  const { data: sources } = await supabase
    .from('sources')
    .select(SOURCE_BRIEF)
    .in('creator_entity_id', ids);

  const byEntity: Record<string, LinkedSource[]> = {};
  for (const s of (sources || []) as LinkedSource[]) {
    if (!s.creator_entity_id) continue;
    (byEntity[s.creator_entity_id] ||= []).push(s);
  }
  return (entities as CreatorEntity[]).map((e) => ({ ...e, sources: byEntity[e.id] || [] }));
}

export async function createCreatorEntity(input: {
  name: string;
  avatar_url?: string | null;
  bio?: string | null;
}): Promise<CreatorEntity> {
  const supabase = getSupabase();
  const slug = await uniqueSlug(slugify(input.name));
  const { data, error } = await supabase
    .from('creator_entities')
    .insert({ name: input.name.trim(), slug, avatar_url: input.avatar_url || null, bio: input.bio || null })
    .select('*')
    .single();
  if (error) throw error;
  return data as CreatorEntity;
}

export async function deleteCreatorEntity(id: string): Promise<void> {
  const supabase = getSupabase();
  // sources.creator_entity_id is ON DELETE SET NULL, so linked sources just detach.
  const { error } = await supabase.from('creator_entities').delete().eq('id', id);
  if (error) throw error;
}

export async function linkSourceToEntity(sourceId: string, entityId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('sources')
    .update({ creator_entity_id: entityId, updated_at: new Date().toISOString() })
    .eq('id', sourceId);
  if (error) throw error;
}

export async function unlinkSource(sourceId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('sources')
    .update({ creator_entity_id: null, updated_at: new Date().toISOString() })
    .eq('id', sourceId);
  if (error) throw error;
}

// All active sources in brief form, for the admin linking picker.
export async function listSourcesForLinking(): Promise<LinkedSource[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sources')
    .select(SOURCE_BRIEF)
    .eq('is_active', true)
    .order('handle_or_url', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return (data || []) as LinkedSource[];
}

// Given a source id, return its creator entity (if any) and all sibling sources
// under that entity (including the source itself). Null when unlinked.
export async function getEntityForSource(
  sourceId: string,
): Promise<{ entity: CreatorEntity; sources: LinkedSource[] } | null> {
  const supabase = getSupabase();
  const { data: src } = await supabase
    .from('sources')
    .select('creator_entity_id')
    .eq('id', sourceId)
    .maybeSingle();
  const entityId = src?.creator_entity_id;
  if (!entityId) return null;

  const [{ data: entity }, { data: sources }] = await Promise.all([
    supabase.from('creator_entities').select('*').eq('id', entityId).maybeSingle(),
    supabase.from('sources').select(SOURCE_BRIEF).eq('creator_entity_id', entityId),
  ]);
  if (!entity) return null;
  return { entity: entity as CreatorEntity, sources: (sources || []) as LinkedSource[] };
}

// Hit rate summed across every source under a creator entity.
export async function getCombinedHitRate(sourceIds: string[]): Promise<SourceHitRate> {
  const rates = await Promise.all(sourceIds.map((id) => getSourceHitRate(id)));
  const combined: SourceHitRate = { source_id: 'combined', total: 0, scored: 0, wins: 0, losses: 0, avg_return_pct: null };
  let retSum = 0;
  let retCount = 0;
  for (const r of rates) {
    combined.total += r.total;
    combined.scored += r.scored;
    combined.wins += r.wins;
    combined.losses += r.losses;
    if (r.avg_return_pct != null) {
      // weight each source's avg by its scored count
      retSum += r.avg_return_pct * Math.max(r.scored, 1);
      retCount += Math.max(r.scored, 1);
    }
  }
  combined.avg_return_pct = retCount > 0 ? retSum / retCount : null;
  return combined;
}
