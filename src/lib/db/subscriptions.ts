import { getSupabase } from './client';
import type { Subscription, NewsletterV2 } from '@/types';

const supabase = () => getSupabase();

export async function subscribe(
  userId: string,
  newsletterId: string,
  deliveryEmail?: string,
  sendWindows?: string[],
  receiveDays?: string[],
): Promise<Subscription> {
  const row: Record<string, any> = { user_id: userId, newsletter_id: newsletterId, is_active: true };
  if (deliveryEmail) row.delivery_email = deliveryEmail;
  if (sendWindows) {
    row.send_windows = sendWindows;
    row.receive_windows = sendWindows;
  }
  if (receiveDays) row.receive_days = receiveDays;

  const { data, error } = await supabase()
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id,newsletter_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unsubscribe(userId: string, newsletterId: string): Promise<void> {
  const { error } = await supabase()
    .from('subscriptions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('newsletter_id', newsletterId);

  if (error) throw error;
}

export async function getUserSubscriptions(userId: string, activeOnly = false): Promise<(Subscription & { newsletter: NewsletterV2 })[]> {
  let query = supabase()
    .from('subscriptions')
    .select('*, newsletters_v2(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    newsletter: row.newsletters_v2,
  }));
}

export async function getNewsletterSubscribers(newsletterId: string): Promise<{
  user_id: string;
  email: string;
  delivery_email: string | null;
  send_windows: string[];
  receive_windows: string[];
  receive_days: string[];
}[]> {
  const { data, error } = await supabase()
    .from('subscriptions')
    .select('user_id, delivery_email, send_windows, receive_windows, receive_days, users(email)')
    .eq('newsletter_id', newsletterId)
    .eq('is_active', true);

  if (error) throw error;
  return (data || [])
    .filter((row: any) => row.delivery_email || row.users?.email)
    .map((row: any) => ({
      user_id: row.user_id,
      email: row.users?.email || '',
      delivery_email: row.delivery_email || null,
      send_windows: row.send_windows || ['morning'],
      receive_windows: row.receive_windows || row.send_windows || ['morning'],
      receive_days: row.receive_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    }));
}

export async function isSubscribed(userId: string, newsletterId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('newsletter_id', newsletterId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

export async function getSubscription(userId: string, newsletterId: string) {
  const { data, error } = await supabase()
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('newsletter_id', newsletterId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getSubscriptionCount(newsletterId: string): Promise<number> {
  const { count, error } = await supabase()
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('newsletter_id', newsletterId)
    .eq('is_active', true);

  if (error) throw error;
  return count ?? 0;
}
