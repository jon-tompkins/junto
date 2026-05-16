import { NextRequest, NextResponse } from 'next/server';
import { getProfileByHandle } from '@/lib/db/source-analyst-profiles';
import { getPublicNewslettersByTwitterHandle, getUserIdByTwitterHandle } from '@/lib/db/newsletters-v2';
import { getUserJuntos } from '@/lib/db/juntos';
import { getSubscribedNewslettersByUserId } from '@/lib/db/subscriptions';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await params;
    const [profile, dispatches, userId] = await Promise.all([
      getProfileByHandle(handle),
      getPublicNewslettersByTwitterHandle(handle),
      getUserIdByTwitterHandle(handle),
    ]);
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [juntos, subscribedDispatches] = userId
      ? await Promise.all([
          getUserJuntos(userId),
          getSubscribedNewslettersByUserId(userId),
        ])
      : [[], []];

    return NextResponse.json({ profile, dispatches, juntos, subscribedDispatches });
  } catch (err) {
    console.error('[api/sources/[handle]]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
