import { getSupabase } from './client';

export interface PersonalDispatch {
  id: string;
  user_id: string;
  dispatch_date: string;
  subject: string;
  content: string;
  source_count: number;
  ticker_count: number;
  sent_email_at: string | null;
  sent_telegram_at: string | null;
  created_at: string;
}

export async function upsertPersonalDispatch(d: {
  user_id: string;
  dispatch_date: string;
  subject: string;
  content: string;
  source_count: number;
  ticker_count: number;
}): Promise<PersonalDispatch> {
  const { data, error } = await getSupabase()
    .from('personal_dispatches')
    .upsert(d, { onConflict: 'user_id,dispatch_date' })
    .select()
    .single();
  if (error) throw error;
  return data as PersonalDispatch;
}

export async function markPersonalDispatchSent(
  id: string,
  channel: 'email' | 'telegram',
): Promise<void> {
  const column = channel === 'email' ? 'sent_email_at' : 'sent_telegram_at';
  const { error } = await getSupabase()
    .from('personal_dispatches')
    .update({ [column]: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function getLatestPersonalDispatch(
  userId: string,
): Promise<PersonalDispatch | null> {
  const { data, error } = await getSupabase()
    .from('personal_dispatches')
    .select('*')
    .eq('user_id', userId)
    .order('dispatch_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PersonalDispatch) || null;
}

export async function listPersonalDispatches(
  userId: string,
  limit = 14,
): Promise<PersonalDispatch[]> {
  const { data, error } = await getSupabase()
    .from('personal_dispatches')
    .select('*')
    .eq('user_id', userId)
    .order('dispatch_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as PersonalDispatch[]) || [];
}
