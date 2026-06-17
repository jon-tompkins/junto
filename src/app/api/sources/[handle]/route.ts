import { NextRequest, NextResponse } from 'next/server';
import { getProfileByHandle, getSourceHitRate } from '@/lib/db/source-analyst-profiles';
import { getPublicNewslettersByTwitterHandle, getUserIdByTwitterHandle } from '@/lib/db/newsletters-v2';
import { getSubscribedNewslettersByUserId } from '@/lib/db/subscriptions';
import { getSupabase } from '@/lib/db/client';

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

    const [juntos, subscribedDispatches, hitRate] = await Promise.all([
      getPublicJuntosContainingSource(profile.source_id),
      userId ? getSubscribedNewslettersByUserId(userId) : Promise.resolve([]),
      getSourceHitRate(profile.source_id),
    ]);

    return NextResponse.json({ profile, dispatches, juntos, subscribedDispatches, hitRate });
  } catch (err) {
    console.error('[api/sources/[handle]]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
