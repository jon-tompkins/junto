import { getSupabase } from './client';
import type { NewsletterRun, NewsletterRunStatus } from '@/types';

const supabase = () => getSupabase();

export async function storeRun(run: {
  newsletter_id: string;
  content?: string | null;
  subject?: string;
  model_used?: string;
  tokens_used?: { input_tokens?: number; output_tokens?: number };
  metadata?: Record<string, unknown>;
  status?: NewsletterRunStatus;
  error_message?: string;
}): Promise<NewsletterRun> {
  const { data, error } = await supabase()
    .from('newsletter_runs')
    .insert({
      newsletter_id: run.newsletter_id,
      content: run.content ?? null,
      subject: run.subject || null,
      model_used: run.model_used || null,
      tokens_used: run.tokens_used || {},
      metadata: run.metadata || {},
      status: run.status || 'delivered',
      error_message: run.error_message || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Record a skipped or failed generation attempt without content.
export async function storeSkippedRun(
  newsletterId: string,
  status: Extract<NewsletterRunStatus, 'skipped' | 'error'>,
  errorMessage: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase()
    .from('newsletter_runs')
    .insert({
      newsletter_id: newsletterId,
      content: null,
      status,
      error_message: errorMessage,
      metadata: metadata || {},
    });

  if (error) console.error('[newsletter-runs] Failed to store skipped run:', error);
}

export async function updateRunStatus(
  runId: string,
  status: NewsletterRunStatus,
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabase()
    .from('newsletter_runs')
    .update({ status, error_message: errorMessage || null })
    .eq('id', runId);

  if (error) console.error('[newsletter-runs] Failed to update run status:', error);
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
  offset: number = 0,
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

// Returns the last N delivered runs for a newsletter — used as anti-repeat context
// when generating the next dispatch (so the LLM avoids re-surfacing the same quotes).
export async function getRecentDeliveredRuns(
  newsletterId: string,
  limit: number = 3,
): Promise<Pick<NewsletterRun, 'id' | 'subject' | 'content' | 'generated_at'>[]> {
  const { data, error } = await supabase()
    .from('newsletter_runs')
    .select('id, subject, content, generated_at')
    .eq('newsletter_id', newsletterId)
    .in('status', ['delivered', 'partial_delivered', 'generated', 'generated_not_delivered'])
    .not('content', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[newsletter-runs] Failed to fetch recent delivered runs:', error);
    return [];
  }
  return data || [];
}

// Returns the last N runs across ALL newsletters — useful for admin health checks.
export async function getRecentRuns(limit: number = 50): Promise<NewsletterRun[]> {
  const { data, error } = await supabase()
    .from('newsletter_runs')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
