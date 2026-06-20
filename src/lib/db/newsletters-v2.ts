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
  send_days?: string[];
  default_send_windows?: string[];
  prompt_template_id?: string | null;
  junto_id: string | null;
  watchlist_id?: string | null;
  audio_enabled?: boolean;
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
      send_days: newsletter.send_days ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
      default_send_windows: newsletter.default_send_windows ?? ['morning'],
      prompt_template_id: newsletter.prompt_template_id || null,
      junto_id: newsletter.junto_id || null,
      watchlist_id: newsletter.watchlist_id || null,
      audio_enabled: newsletter.audio_enabled ?? false,
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

export async function getPublicNewslettersByTwitterHandle(twitterHandle: string): Promise<NewsletterV2[]> {
  const handle = twitterHandle.toLowerCase().replace('@', '');
  const { data, error } = await supabase()
    .from('newsletters_v2')
    .select('*, users!admin_user_id(twitter_handle)')
    .eq('is_public', true)
    .eq('users.twitter_handle', handle)
    .order('subscriber_count', { ascending: false });

  if (error) throw error;
  return (data || []).filter((n: any) => n.users?.twitter_handle === handle);
}

export async function updateNewsletter(id: string, updates: Partial<Pick<NewsletterV2, 'name' | 'description' | 'prompt' | 'secondary_prompt' | 'is_public' | 'schedule_cadence' | 'credit_cost'>> & { send_days?: string[]; default_send_windows?: string[]; prompt_template_id?: string | null; audio_enabled?: boolean }): Promise<NewsletterV2> {
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
// Curator Info
// ============================================================

export interface CuratorInfo {
  display_name: string | null;
  twitter_handle: string | null;
  avatar_url: string | null;
}

export async function getUserIdByTwitterHandle(handle: string): Promise<string | null> {
  const clean = handle.toLowerCase().replace('@', '');
  const { data, error } = await supabase()
    .from('users')
    .select('id')
    .eq('twitter_handle', clean)
    .single();
  if (error) return null;
  return data?.id ?? null;
}

export async function getCuratorInfo(userId: string): Promise<CuratorInfo | null> {
  const { data, error } = await supabase()
    .from('users')
    .select('display_name, twitter_handle, avatar_url')
    .eq('id', userId)
    .single();

  if (error) return null;
  // Only show avatar if user has a Twitter handle (ensures Twitter avatar, not Google)
  if (data && !data.twitter_handle) {
    data.avatar_url = null;
  }
  return data;
}

export async function getCuratorInfoBatch(userIds: string[]): Promise<Record<string, CuratorInfo>> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds)];
  const { data, error } = await supabase()
    .from('users')
    .select('id, display_name, twitter_handle, avatar_url')
    .in('id', unique);

  if (error || !data) return {};
  const map: Record<string, CuratorInfo> = {};
  for (const u of data) {
    // Only show avatar if user has a Twitter handle (ensures Twitter avatar, not Google)
    map[u.id] = { 
      display_name: u.display_name, 
      twitter_handle: u.twitter_handle, 
      avatar_url: u.twitter_handle ? u.avatar_url : null 
    };
  }
  return map;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const direct = (data || []).map((row: any) => row.sources as Source).filter(Boolean);
  if (direct.length > 0) return direct;

  // Fall through to junto sources for junto-based dispatches
  const { data: nl } = await supabase()
    .from('newsletters_v2')
    .select('junto_id')
    .eq('id', newsletterId)
    .single();

  if (!nl?.junto_id) return [];

  const { data: js, error: jsError } = await supabase()
    .from('junto_sources')
    .select('source_id, sources(*)')
    .eq('junto_id', nl.junto_id);

  if (jsError) throw jsError;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (js || []).map((row: any) => row.sources as Source).filter(Boolean);
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

// Send windows defined in Pacific time (handles PST/PDT automatically)
const SEND_WINDOW_PACIFIC_HOURS = {
  morning: 6,   // 6 AM Pacific
  midday: 12,   // 12 PM Pacific
  evening: 18,  // 6 PM Pacific
  night: 0,     // 12 AM Pacific
} as const;

export type SendWindow = keyof typeof SEND_WINDOW_PACIFIC_HOURS;

export const SEND_WINDOW_LABELS: Record<SendWindow, string> = {
  morning: '6:00 AM',
  midday: '12:00 PM',
  evening: '6:00 PM',
  night: '12:00 AM',
};

// Convert a Pacific hour to current UTC hour (DST-aware)
function pacificHourToUTC(pacificHour: number): number {
  // Create a date at the target Pacific hour today
  const now = new Date();
  const pacificDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pacificDate.setHours(pacificHour, 0, 0, 0);
  // Calculate the offset between Pacific and UTC right now
  const utcNow = now.getTime();
  const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime();
  const offsetMs = utcNow - pacificNow;
  // Apply offset to get UTC hour
  const utcTarget = new Date(pacificDate.getTime() + offsetMs);
  return utcTarget.getUTCHours();
}

// Get current UTC send times (recomputed to handle DST)
export function getSendWindowTimesUTC(): Record<SendWindow, number> {
  return {
    morning: pacificHourToUTC(6),
    midday: pacificHourToUTC(12),
    evening: pacificHourToUTC(18),
    night: pacificHourToUTC(0),
  };
}

const WINDOW_TOLERANCE_MINUTES = 15;

export function getCurrentSendWindow(nowUTC?: Date): SendWindow | null {
  const now = nowUTC || new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const windowTimes = getSendWindowTimesUTC();

  for (const [window, sendHour] of Object.entries(windowTimes)) {
    const diffMinutes = (hour - sendHour) * 60 + minute;
    if (diffMinutes >= 0 && diffMinutes < WINDOW_TOLERANCE_MINUTES) {
      return window as SendWindow;
    }
  }
  return null;
}

// Map UTC day to short name (PST day may differ from UTC day near midnight)
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayName = typeof DAY_NAMES[number];

export function getCurrentPSTDay(nowUTC?: Date): DayName {
  const now = nowUTC || new Date();
  // PST is UTC-8
  const pstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return DAY_NAMES[pstDate.getDay()];
}

export async function getNewslettersDueForGeneration(): Promise<NewsletterV2[]> {
  const now = new Date();
  const currentWindow = getCurrentSendWindow(now);

  if (!currentWindow) return [];

  const currentDay = getCurrentPSTDay(now);

  console.log(`[generate] Current window: ${currentWindow}, day: ${currentDay} (UTC ${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2, '0')})`);

  // Owner's schedule drives generation — fetch all newsletters and filter by their windows+days
  const { data: newsletters, error } = await supabase()
    .from('newsletters_v2')
    .select('*');

  if (error || !newsletters?.length) return [];

  const scheduled = newsletters.filter(nl => {
    const ownerWindows = nl.default_send_windows || ['morning'];
    const ownerDays = nl.send_days || ['mon', 'tue', 'wed', 'thu', 'fri'];
    return ownerWindows.includes(currentWindow) && ownerDays.includes(currentDay);
  });

  if (scheduled.length === 0) return [];

  // Only generate for newsletters with at least one active subscriber
  const { data: subData } = await supabase()
    .from('subscriptions')
    .select('newsletter_id')
    .eq('is_active', true)
    .in('newsletter_id', scheduled.map(nl => nl.id));

  const subscribedIds = new Set((subData || []).map((s: any) => s.newsletter_id));
  const dayFiltered = scheduled.filter(nl => subscribedIds.has(nl.id));

  // Filter out newsletters that already ran in this window (min 5h gap).
  // One bounded query for all candidates: any newsletter with a run in the
  // last 5h is excluded; everything else (including never-run) is due.
  const cutoff = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const { data: recentRuns } = await supabase()
    .from('newsletter_runs')
    .select('newsletter_id')
    .in('newsletter_id', dayFiltered.map(nl => nl.id))
    .gte('generated_at', cutoff);

  const ranRecently = new Set((recentRuns || []).map((r: { newsletter_id: string }) => r.newsletter_id));
  return dayFiltered.filter(nl => !ranRecently.has(nl.id));
}

// Bypass the time-of-day/day-of-week gate for manual testing. Still requires
// at least one active subscriber. If newsletterId is provided, only that one
// is returned (if it has subscribers).
export async function getNewslettersForForcedGeneration(
  newsletterId?: string,
): Promise<NewsletterV2[]> {
  const { data: subData, error: subError } = await supabase()
    .from('subscriptions')
    .select('newsletter_id')
    .eq('is_active', true);

  if (subError || !subData?.length) return [];

  const subscribedIds = new Set<string>(subData.map((s) => s.newsletter_id));
  if (subscribedIds.size === 0) return [];

  const ids = newsletterId
    ? [newsletterId].filter((id) => subscribedIds.has(id))
    : Array.from(subscribedIds);

  if (ids.length === 0) return [];

  const { data: newsletters, error } = await supabase()
    .from('newsletters_v2')
    .select('*')
    .in('id', ids);

  if (error) return [];
  return newsletters || [];
}
