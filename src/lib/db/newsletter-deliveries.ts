import { getSupabase } from './client';
import type { NewsletterDelivery } from '@/types';

const supabase = () => getSupabase();

export async function recordDelivery(delivery: {
  run_id: string;
  user_id: string;
  delivery_method?: string;
}): Promise<NewsletterDelivery> {
  const { data, error } = await supabase()
    .from('newsletter_deliveries')
    .insert({
      run_id: delivery.run_id,
      user_id: delivery.user_id,
      delivery_method: delivery.delivery_method || 'email',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function recordBulkDeliveries(
  runId: string,
  userIds: string[],
  deliveryMethod: string = 'email'
): Promise<number> {
  if (userIds.length === 0) return 0;

  const rows = userIds.map((userId) => ({
    run_id: runId,
    user_id: userId,
    delivery_method: deliveryMethod,
  }));

  const { data, error } = await supabase()
    .from('newsletter_deliveries')
    .insert(rows)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

export async function getUserDeliveries(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<(NewsletterDelivery & { run: { subject: string | null; newsletter_id: string } })[]> {
  const { data, error } = await supabase()
    .from('newsletter_deliveries')
    .select('*, newsletter_runs(subject, newsletter_id)')
    .eq('user_id', userId)
    .order('delivered_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data || []).map((row: NewsletterDelivery & { newsletter_runs: { subject: string | null; newsletter_id: string } }) => ({
    ...row,
    run: row.newsletter_runs,
  }));
}

export async function getDeliveriesForRun(runId: string): Promise<NewsletterDelivery[]> {
  const { data, error } = await supabase()
    .from('newsletter_deliveries')
    .select('*')
    .eq('run_id', runId);

  if (error) throw error;
  return data || [];
}
