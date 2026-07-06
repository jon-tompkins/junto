import { NextRequest, NextResponse } from 'next/server';
import { getProfileByHandle, getSourceHitRate } from '@/lib/db/source-analyst-profiles';
import { getPublicNewslettersByTwitterHandle, getUserIdByTwitterHandle } from '@/lib/db/newsletters-v2';
import { getSubscribedNewslettersByUserId } from '@/lib/db/subscriptions';
import { getEntityForSource, getCombinedHitRate } from '@/lib/db/creator-entities';
import { getSupabase } from '@/lib/db/client';

// A source's realized track record: every call they've closed (win/loss/flat),
// most-recently-closed first. Powers the "closed call history" view.
async function getClosedCallsForSource(sourceId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('source_call_outcomes')
    .select('ticker, stance, outcome, return_pct, entry_price, exit_price, entry_date, exit_date, close_reason')
    .eq('source_id', sourceId)
    .order('exit_date', { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return data;
}

async function getPublicJuntosContainingSource(sourceId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('junto_sources')
    .select('junto:juntos(id, name, description, is_public, owner_id, created_at)')
    .eq('source_id', sourceId);
  if (error || !data) return [];
  return (data as any[])
    .map((row) => row.junto)
    .filter((j) => j && j.is_public);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await params;
    const [profile, dispatches, userId] = await Promise.all([
      getProfileByHandle(handle),
      getPublicNewslettersByTwitterHandle(handle),
      getUserIdByTwitterHandle(handle),
    ]);
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [juntos, subscribedDispatches, hitRate, entity, closedCalls] = await Promise.all([
      getPublicJuntosContainingSource(profile.source_id),
      userId ? getSubscribedNewslettersByUserId(userId) : Promise.resolve([]),
      getSourceHitRate(profile.source_id),
      getEntityForSource(profile.source_id),
      getClosedCallsForSource(profile.source_id),
    ]);

    // Cross-platform creator identity: sibling sources + a hit rate combined
    // across every platform under the same creator.
    let creator = null;
    if (entity) {
      const siblings = entity.sources
        .filter((s) => s.id !== profile.source_id)
        .map((s) => ({ type: s.type, handle_or_url: s.handle_or_url, display_name: s.display_name }));
      const combinedHitRate = entity.sources.length > 1
        ? await getCombinedHitRate(entity.sources.map((s) => s.id))
        : null;
      creator = { name: entity.entity.name, slug: entity.entity.slug, siblings, combinedHitRate };
    }

    return NextResponse.json({ profile, dispatches, juntos, subscribedDispatches, hitRate, creator, closedCalls });
  } catch (err) {
    console.error('[api/sources/[handle]]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
