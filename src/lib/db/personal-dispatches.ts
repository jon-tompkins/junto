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
  audio_url: string | null;
  audio_bytes: number | null;
  audio_duration_sec: number | null;
  audio_script: string | null;
  created_at: string;
}

export async function setDispatchAudio(
  id: string,
  audio: { url: string; bytes: number; durationSec: number; script: string },
): Promise<void> {
  const { error } = await getSupabase()
    .from('personal_dispatches')
    .update({
      audio_url: audio.url,
      audio_bytes: audio.bytes,
      audio_duration_sec: audio.durationSec,
      audio_script: audio.script,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function listPersonalDispatchesWithAudio(
  userId: string,
  limit = 50,
): Promise<PersonalDispatch[]> {
  const { data, error } = await getSupabase()
    .from('personal_dispatches')
    .select('*')
    .eq('user_id', userId)
    .not('audio_url', 'is', null)
    .order('dispatch_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as PersonalDispatch[]) || [];
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
