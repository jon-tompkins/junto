import { getSupabase } from './client';
import type { NewsletterRun } from '@/types';

const supabase = () => getSupabase();

export async function storeRun(run: {
  newsletter_id: string;
  content: string;
  subject?: string;
  model_used?: string;
  tokens_used?: { input_tokens?: number; output_tokens?: number };
  metadata?: Record<string, unknown>;
}): Promise<NewsletterRun> {
  const { data, error } = await supabase()
    .from('newsletter_runs')
    .insert({
      newsletter_id: run.newsletter_id,
      content: run.content,
      subject: run.subject || null,
      model_used: run.model_used || null,
      tokens_used: run.tokens_used || {},
      metadata: run.metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestRun(newsletterId: string): Promise<NewsletterRun | null> {
  const { data, error } = await supabase()
    .from('newsletter_runs')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getRunsByNewsletter(
  newsletterId: string,
  limit: number = 20,
  offset: number = 0
): Promise<NewsletterRun[]> {
  const { data, error } = await supabase()
    .from('newsletter_runs')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('generated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data || [];
}

export async function getRunById(id: string): Promise<NewsletterRun | null> {
  const { data, error } = await supabase()
    .from('newsletter_runs')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
