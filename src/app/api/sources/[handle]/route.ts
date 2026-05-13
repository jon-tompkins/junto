import { NextRequest, NextResponse } from 'next/server';
import { getProfileByHandle } from '@/lib/db/source-analyst-profiles';
import { getPublicNewslettersByTwitterHandle } from '@/lib/db/newsletters-v2';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await params;
    const [profile, dispatches] = await Promise.all([
      getProfileByHandle(handle),
      getPublicNewslettersByTwitterHandle(handle),
    ]);
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ profile, dispatches });
  } catch (err) {
    console.error('[api/sources/[handle]]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
