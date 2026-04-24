import { getSupabase } from './client';

export interface Junto {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface JuntoSource {
  id: string;
  junto_id: string;
  source_id: string;
  added_at: string;
  source?: {
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
    type: string;
  };
}

export interface JuntoWithSources extends Junto {
  junto_sources: JuntoSource[];
}

export async function createJunto(
  name: string,
  description: string | null,
  ownerId: string,
  isPublic: boolean = true,
): Promise<Junto> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('juntos')
    .insert({
      name,
      description,
      owner_id: ownerId,
      is_public: isPublic,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Junto;
}

export async function getJunto(id: string): Promise<Junto | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('juntos')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data as Junto;
}

export async function getJuntoWithSources(id: string): Promise<JuntoWithSources | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('juntos')
    .select(`
      *,
      junto_sources(
        id,
        junto_id,
        source_id,
        added_at,
        source:sources(id, handle_or_url, display_name, avatar_url, type)
      )
    `)
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data as JuntoWithSources;
}

export async function getUserJuntos(userId: string): Promise<Junto[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('juntos')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Junto[];
}

export async function addSourceToJunto(juntoId: string, sourceId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('junto_sources')
    .insert({ junto_id: juntoId, source_id: sourceId });

  if (error && error.code !== '23505') throw error;
}

export async function removeSourceFromJunto(juntoId: string, sourceId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('junto_sources')
    .delete()
    .eq('junto_id', juntoId)
    .eq('source_id', sourceId);

  if (error) throw error;
}

export async function updateJunto(
  id: string,
  updates: Partial<Pick<Junto, 'name' | 'description' | 'is_public'>>,
): Promise<Junto> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('juntos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Junto;
}

export async function deleteJunto(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('juntos').delete().eq('id', id);
  if (error) throw error;
}

export async function syncJuntoToNewsletter(juntoId: string, newsletterId: string): Promise<void> {
  const supabase = getSupabase();

  const { error: delError } = await supabase
    .from('newsletter_sources')
    .delete()
    .eq('newsletter_id', newsletterId);
  if (delError) throw delError;

  const { data: juntoSources, error: jsError } = await supabase
    .from('junto_sources')
    .select('source_id')
    .eq('junto_id', juntoId);
  if (jsError) throw jsError;

  if (!juntoSources?.length) return;

  const rows = juntoSources.map((js: { source_id: string }) => ({
    newsletter_id: newsletterId,
    source_id: js.source_id,
  }));

  const { error: insError } = await supabase.from('newsletter_sources').insert(rows);
  if (insError) throw insError;
}
