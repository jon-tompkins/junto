import { getSupabase } from './client';

const supabase = () => getSupabase();

export interface ContentNewsletter {
  id: string;
  source_id: string;
  newsletter_content_id: string;
  subject: string | null;
  content: string;
  received_at: string;
  fetched_at: string;
}

export async function storeNewsletterContent(
  sourceId: string,
  items: {
    newsletter_content_id: string;
    subject?: string | null;
    content: string;
    received_at: string;
  }[]
): Promise<number> {
  if (items.length === 0) return 0;

  const rows = items.map((item) => ({
    source_id: sourceId,
    newsletter_content_id: item.newsletter_content_id,
    subject: item.subject ?? null,
    content: item.content,
    received_at: item.received_at,
    fetched_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase()
    .from('content_newsletter')
    .upsert(rows, { onConflict: 'source_id,newsletter_content_id' })
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

export async function getRecentContentForNewsletterSources(
  sourceIds: string[],
  hoursBack: number = 48
): Promise<ContentNewsletter[]> {
  if (sourceIds.length === 0) return [];
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase()
    .from('content_newsletter')
    .select('*')
    .in('source_id', sourceIds)
    .gte('received_at', since)
    .order('received_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getContextContentForNewsletterSources(
  sourceIds: string[],
  daysBack: number = 7,
  excludeRecentHours: number = 48
): Promise<ContentNewsletter[]> {
  if (sourceIds.length === 0) return [];
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const recentCutoff = new Date(Date.now() - excludeRecentHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase()
    .from('content_newsletter')
    .select('*')
    .in('source_id', sourceIds)
    .gte('received_at', sinceDate)
    .lt('received_at', recentCutoff)
    .order('received_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

/**
 * Group newsletter content by source slug for the synthesis pipeline.
 * Requires a sourceMap of { source_id: slug } to group by.
 */
export function groupNewsletterContentBySlug(
  content: ContentNewsletter[],
  sourceMap: Record<string, string>
): Record<string, { subject: string | null; content: string; received_at: string }[]> {
  const grouped: Record<string, { subject: string | null; content: string; received_at: string }[]> = {};

  for (const item of content) {
    const slug = sourceMap[item.source_id];
    if (!slug) continue;

    if (!grouped[slug]) grouped[slug] = [];
    grouped[slug].push({
      subject: item.subject,
      content: item.content,
      received_at: item.received_at,
    });
  }

  return grouped;
}
