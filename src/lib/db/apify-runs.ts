import { getSupabase } from './client';

const supabase = () => getSupabase();

export interface ApifyPendingRun {
  id: string;
  run_id: string;
  handle_source_map: Record<string, string>;
  since_date: string | null;
  started_at: string;
  completed_at: string | null;
  status: 'pending' | 'completed' | 'failed';
  error: string | null;
}

export async function createPendingRun(args: {
  runId: string;
  handleSourceMap: Record<string, string>;
  sinceDate?: string | null;
}): Promise<ApifyPendingRun> {
  const { data, error } = await supabase()
    .from('apify_pending_runs')
    .insert({
      run_id: args.runId,
      handle_source_map: args.handleSourceMap,
      since_date: args.sinceDate ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listPendingRuns(): Promise<ApifyPendingRun[]> {
  const { data, error } = await supabase()
    .from('apify_pending_runs')
    .select('*')
    .eq('status', 'pending')
    .order('started_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function markRunCompleted(id: string): Promise<void> {
  const { error } = await supabase()
    .from('apify_pending_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

export async function markRunFailed(id: string, errorMsg: string): Promise<void> {
  const { error } = await supabase()
    .from('apify_pending_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMsg.slice(0, 1000),
    })
    .eq('id', id);

  if (error) throw error;
}
