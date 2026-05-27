// Personal dispatch DB layer — backed by the unified newsletters_v2 + newsletter_runs
// tables (migration 042). The "personal" newsletter for a user is the row in
// newsletters_v2 with is_personal=TRUE and admin_user_id=<userId>.
//
// PersonalDispatch shape mirrors what callers expect from the legacy
// personal_dispatches table so the surface above (RSS feed, /today, /api/v2)
// stays the same.

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

interface RunRow {
  id: string;
  newsletter_id: string;
  content: string;
  subject: string | null;
  generated_at: string;
  dispatch_date: string | null;
  audio_url: string | null;
  audio_bytes: number | null;
  audio_duration_sec: number | null;
  audio_script: string | null;
  metadata: any;
}

async function getOrCreatePersonalNewsletter(userId: string): Promise<{ id: string; junto_id: string | null }> {
  const supabase = getSupabase();
  const existing = await supabase
    .from('newsletters_v2')
    .select('id, junto_id')
    .eq('admin_user_id', userId)
    .eq('is_personal', true)
    .maybeSingle();
  if (existing.data) return { id: existing.data.id, junto_id: existing.data.junto_id };

  // Auto-create on first dispatch — pulls junto_id from users.featured_junto_id if set.
  const { data: user } = await supabase
    .from('users')
    .select('display_name, twitter_handle, featured_junto_id')
    .eq('id', userId)
    .maybeSingle();
  const namePrefix = user?.display_name || user?.twitter_handle || 'Your';
  const { data, error } = await supabase
    .from('newsletters_v2')
    .insert({
      name: `${namePrefix} Daily Dispatch`,
      prompt: '',
      admin_user_id: userId,
      is_public: false,
      schedule_cadence: 'daily',
      junto_id: user?.featured_junto_id || null,
      is_personal: true,
      send_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      default_send_windows: ['morning'],
    })
    .select('id, junto_id')
    .single();
  if (error) throw error;
  return { id: data.id, junto_id: data.junto_id };
}

export async function getPersonalNewsletterId(userId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('newsletters_v2')
    .select('id')
    .eq('admin_user_id', userId)
    .eq('is_personal', true)
    .maybeSingle();
  return data?.id || null;
}

async function fetchDeliveryTimestamps(runIds: string[]): Promise<Map<string, { email: string | null; telegram: string | null }>> {
  const map = new Map<string, { email: string | null; telegram: string | null }>();
  if (runIds.length === 0) return map;
  const { data } = await getSupabase()
    .from('newsletter_deliveries')
    .select('run_id, delivered_at, delivery_method')
    .in('run_id', runIds);
  for (const row of (data || []) as any[]) {
    const cur = map.get(row.run_id) || { email: null, telegram: null };
    if (row.delivery_method === 'email') cur.email = row.delivered_at;
    else if (row.delivery_method === 'telegram') cur.telegram = row.delivered_at;
    map.set(row.run_id, cur);
  }
  return map;
}

function runToPersonalDispatch(
  run: RunRow,
  userId: string,
  delivery: { email: string | null; telegram: string | null } | undefined,
): PersonalDispatch {
  const meta = run.metadata || {};
  return {
    id: run.id,
    user_id: userId,
    dispatch_date: run.dispatch_date || run.generated_at.slice(0, 10),
    subject: run.subject || '',
    content: run.content,
    source_count: typeof meta.source_count === 'number' ? meta.source_count : 0,
    ticker_count: typeof meta.ticker_count === 'number' ? meta.ticker_count : 0,
    sent_email_at: delivery?.email || null,
    sent_telegram_at: delivery?.telegram || null,
    audio_url: run.audio_url,
    audio_bytes: run.audio_bytes,
    audio_duration_sec: run.audio_duration_sec,
    audio_script: run.audio_script,
    created_at: run.generated_at,
  };
}

export async function setDispatchAudio(
  id: string,
  audio: { url: string; bytes: number; durationSec: number; script: string },
): Promise<void> {
  const { error } = await getSupabase()
    .from('newsletter_runs')
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
  const newsletterId = await getPersonalNewsletterId(userId);
  if (!newsletterId) return [];
  const { data, error } = await getSupabase()
    .from('newsletter_runs')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .not('audio_url', 'is', null)
    .order('dispatch_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  const runs = (data || []) as RunRow[];
  const delivery = await fetchDeliveryTimestamps(runs.map(r => r.id));
  return runs.map(r => runToPersonalDispatch(r, userId, delivery.get(r.id)));
}

export async function upsertPersonalDispatch(d: {
  user_id: string;
  dispatch_date: string;
  subject: string;
  content: string;
  source_count: number;
  ticker_count: number;
}): Promise<PersonalDispatch> {
  const { id: newsletterId } = await getOrCreatePersonalNewsletter(d.user_id);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('newsletter_runs')
    .upsert(
      {
        newsletter_id: newsletterId,
        dispatch_date: d.dispatch_date,
        subject: d.subject,
        content: d.content,
        metadata: { source_count: d.source_count, ticker_count: d.ticker_count },
      },
      { onConflict: 'newsletter_id,dispatch_date' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return runToPersonalDispatch(data as RunRow, d.user_id, { email: null, telegram: null });
}

export async function markPersonalDispatchSent(
  id: string,
  channel: 'email' | 'telegram',
): Promise<void> {
  const supabase = getSupabase();
  const { data: run } = await supabase
    .from('newsletter_runs')
    .select('newsletter_id')
    .eq('id', id)
    .maybeSingle();
  if (!run) return;
  const { data: newsletter } = await supabase
    .from('newsletters_v2')
    .select('admin_user_id')
    .eq('id', run.newsletter_id)
    .maybeSingle();
  if (!newsletter) return;
  await supabase.from('newsletter_deliveries').insert({
    run_id: id,
    user_id: newsletter.admin_user_id,
    delivered_at: new Date().toISOString(),
    delivery_method: channel,
  });
}

export async function getLatestPersonalDispatch(userId: string): Promise<PersonalDispatch | null> {
  const newsletterId = await getPersonalNewsletterId(userId);
  if (!newsletterId) return null;
  const { data, error } = await getSupabase()
    .from('newsletter_runs')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('dispatch_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const run = data as RunRow;
  const delivery = await fetchDeliveryTimestamps([run.id]);
  return runToPersonalDispatch(run, userId, delivery.get(run.id));
}

export async function listPersonalDispatches(userId: string, limit = 14): Promise<PersonalDispatch[]> {
  const newsletterId = await getPersonalNewsletterId(userId);
  if (!newsletterId) return [];
  const { data, error } = await getSupabase()
    .from('newsletter_runs')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('dispatch_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  const runs = (data || []) as RunRow[];
  const delivery = await fetchDeliveryTimestamps(runs.map(r => r.id));
  return runs.map(r => runToPersonalDispatch(r, userId, delivery.get(r.id)));
}

export async function getPersonalDispatchById(id: string, userId: string): Promise<PersonalDispatch | null> {
  const supabase = getSupabase();
  const { data: run } = await supabase
    .from('newsletter_runs')
    .select('*, newsletters_v2!inner(admin_user_id, is_personal)')
    .eq('id', id)
    .maybeSingle();
  if (!run) return null;
  const nl = (run as any).newsletters_v2;
  if (!nl?.is_personal || nl.admin_user_id !== userId) return null;
  const delivery = await fetchDeliveryTimestamps([id]);
  return runToPersonalDispatch(run as RunRow, userId, delivery.get(id));
}
