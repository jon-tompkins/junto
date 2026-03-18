import { getSupabase } from './client';
import type { NewsletterV2, NewsletterV2WithSources, Source } from '@/types';

const supabase = () => getSupabase();

// ============================================================
// Newsletter CRUD
// ============================================================

export async function createNewsletter(newsletter: {
  name: string;
  description?: string;
  prompt: string;
  secondary_prompt?: string;
  admin_user_id: string;
  is_public?: boolean;
  schedule_cadence?: string;
  credit_cost?: number;
}): Promise<NewsletterV2> {
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .insert({
      name: newsletter.name,
      description: newsletter.description || null,
      prompt: newsletter.prompt,
      secondary_prompt: newsletter.secondary_prompt || null,
      admin_user_id: newsletter.admin_user_id,
      is_public: newsletter.is_public ?? true,
      schedule_cadence: newsletter.schedule_cadence ?? 'daily',
      credit_cost: newsletter.credit_cost ?? 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getNewsletterById(id: string): Promise<NewsletterV2 | null> {
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getNewsletterWithSources(id: string): Promise<NewsletterV2WithSources | null> {
  const newsletter = await getNewsletterById(id);
  if (!newsletter) return null;

  const [sources, labels] = await Promise.all([
    getNewsletterSources(id),
    getNewsletterLabels(id),
  ]);

  return { ...newsletter, sources, labels };
}

export async function getPublicNewsletters(limit: number = 50, offset: number = 0): Promise<NewsletterV2[]> {
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .select('*')
    .eq('is_public', true)
    .order('subscriber_count', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data || [];
}

export async function getUserNewsletters(userId: string): Promise<NewsletterV2[]> {
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .select('*')
    .eq('admin_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateNewsletter(id: string, updates: Partial<Pick<NewsletterV2, 'name' | 'description' | 'prompt' | 'secondary_prompt' | 'is_public' | 'schedule_cadence' | 'credit_cost'>>): Promise<NewsletterV2> {
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNewsletter(id: string): Promise<void> {
  const { error } = await supabase()
    .from('newsletters_v2')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function searchNewsletters(query: string, limit: number = 20): Promise<NewsletterV2[]> {
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .select('*')
    .eq('is_public', true)
    .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
    .order('subscriber_count', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function searchNewslettersByLabel(label: string, limit: number = 20): Promise<NewsletterV2[]> {
  const { data: labelRows, error: labelError } = await supabase()
    .from('newsletter_labels')
    .select('newsletter_id')
    .eq('label', label.toLowerCase());

  if (labelError) throw labelError;
  if (!labelRows?.length) return [];

  const ids = labelRows.map((r) => r.newsletter_id);
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .select('*')
    .in('id', ids)
    .eq('is_public', true)
    .order('subscriber_count', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ============================================================
// Newsletter Sources
// ============================================================

export async function getNewsletterSources(newsletterId: string): Promise<Source[]> {
  const { data, error } = await supabase()
    .from('newsletter_sources')
    .select('source_id, sources(*)')
    .eq('newsletter_id', newsletterId);

  if (error) throw error;
  return (data || []).map((row: { sources: Source }) => row.sources);
}

export async function addNewsletterSource(newsletterId: string, sourceId: string): Promise<void> {
  const { error } = await supabase()
    .from('newsletter_sources')
    .insert({ newsletter_id: newsletterId, source_id: sourceId });

  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function removeNewsletterSource(newsletterId: string, sourceId: string): Promise<void> {
  const { error } = await supabase()
    .from('newsletter_sources')
    .delete()
    .eq('newsletter_id', newsletterId)
    .eq('source_id', sourceId);

  if (error) throw error;
}

export async function setNewsletterSources(newsletterId: string, sourceIds: string[]): Promise<void> {
  // Clear existing
  const { error: delError } = await supabase()
    .from('newsletter_sources')
    .delete()
    .eq('newsletter_id', newsletterId);

  if (delError) throw delError;

  if (sourceIds.length === 0) return;

  // Insert new
  const rows = sourceIds.map((sourceId) => ({
    newsletter_id: newsletterId,
    source_id: sourceId,
  }));

  const { error } = await supabase()
    .from('newsletter_sources')
    .insert(rows);

  if (error) throw error;
}

// ============================================================
// Newsletter Labels
// ============================================================

export async function getNewsletterLabels(newsletterId: string): Promise<string[]> {
  const { data, error } = await supabase()
    .from('newsletter_labels')
    .select('label')
    .eq('newsletter_id', newsletterId);

  if (error) throw error;
  return (data || []).map((r) => r.label);
}

export async function setNewsletterLabels(newsletterId: string, labels: string[]): Promise<void> {
  const { error: delError } = await supabase()
    .from('newsletter_labels')
    .delete()
    .eq('newsletter_id', newsletterId);

  if (delError) throw delError;

  if (labels.length === 0) return;

  const rows = labels.map((label) => ({
    newsletter_id: newsletterId,
    label: label.toLowerCase().trim(),
  }));

  const { error } = await supabase()
    .from('newsletter_labels')
    .insert(rows);

  if (error) throw error;
}

// ============================================================
// Due newsletters (for cron generation)
// ============================================================

export async function getNewslettersDueForGeneration(): Promise<NewsletterV2[]> {
  const now = new Date();

  // Get all newsletters with their latest run
  const { data: newsletters, error } = await supabase()
    .from('newsletters_v2')
    .select('*');

  if (error) throw error;
  if (!newsletters?.length) return [];

  const due: NewsletterV2[] = [];

  for (const nl of newsletters) {
    // Check latest run
    const { data: latestRun } = await supabase()
      .from('newsletter_runs')
      .select('generated_at')
      .eq('newsletter_id', nl.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    const lastGenerated = latestRun ? new Date(latestRun.generated_at) : null;
    const hoursSinceLastRun = lastGenerated
      ? (now.getTime() - lastGenerated.getTime()) / (1000 * 60 * 60)
      : Infinity;

    let isDue = false;
    switch (nl.schedule_cadence) {
      case 'daily':
        isDue = hoursSinceLastRun >= 23; // ~24h with buffer
        break;
      case 'twice_daily':
        isDue = hoursSinceLastRun >= 11; // ~12h with buffer
        break;
      case 'weekly':
        isDue = hoursSinceLastRun >= 167; // ~7 days with buffer
        break;
    }

    if (isDue) due.push(nl);
  }

  return due;
}
