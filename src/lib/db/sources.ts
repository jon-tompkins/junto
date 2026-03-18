import { getSupabase } from './client';
import type { Source, SourceType } from '@/types';

const supabase = () => getSupabase();

export async function getSourceByHandle(type: SourceType, handle: string): Promise<Source | null> {
  const { data, error } = await supabase()
    .from('sources')
    .select('*')
    .eq('type', type)
    .eq('handle_or_url', handle.toLowerCase().replace('@', ''))
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getSourceById(id: string): Promise<Source | null> {
  const { data, error } = await supabase()
    .from('sources')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getSourcesByIds(ids: string[]): Promise<Source[]> {
  const { data, error } = await supabase()
    .from('sources')
    .select('*')
    .in('id', ids);

  if (error) throw error;
  return data || [];
}

export async function getAllActiveSources(type?: SourceType): Promise<Source[]> {
  let query = supabase()
    .from('sources')
    .select('*')
    .eq('is_active', true);

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createSource(source: {
  type: SourceType;
  handle_or_url: string;
  display_name?: string;
  avatar_url?: string;
  metadata?: Record<string, unknown>;
}): Promise<Source> {
  const { data, error } = await supabase()
    .from('sources')
    .insert({
      type: source.type,
      handle_or_url: source.handle_or_url.toLowerCase().replace('@', ''),
      display_name: source.display_name || null,
      avatar_url: source.avatar_url || null,
      metadata: source.metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getOrCreateSource(source: {
  type: SourceType;
  handle_or_url: string;
  display_name?: string;
  avatar_url?: string;
}): Promise<Source> {
  const existing = await getSourceByHandle(source.type, source.handle_or_url);
  if (existing) return existing;
  return createSource(source);
}

export async function searchSources(query: string, type?: SourceType): Promise<Source[]> {
  let dbQuery = supabase()
    .from('sources')
    .select('*')
    .eq('is_active', true)
    .or(`handle_or_url.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(20);

  if (type) {
    dbQuery = dbQuery.eq('type', type);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;
  return data || [];
}

export async function updateSource(id: string, updates: Partial<Pick<Source, 'display_name' | 'avatar_url' | 'metadata' | 'is_active'>>): Promise<Source> {
  const { data, error } = await supabase()
    .from('sources')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
