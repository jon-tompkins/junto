import { NextRequest, NextResponse } from 'next/server';
import { withApiKey } from '@/lib/api-auth';
import { getProfileByHandle } from '@/lib/db/source-analyst-profiles';

export const GET = (req: NextRequest, { params }: { params: Promise<{ handle: string }> }) =>
  withApiKey('GET /sources/:handle', 'source_profile', async () => {
    const { handle } = await params;
    const profile = await getProfileByHandle(handle);
    if (!profile) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json({
      handle: (profile as any).source?.handle_or_url ?? handle,
      display_name: (profile as any).source?.display_name ?? null,
      avatar_url: (profile as any).source?.avatar_url ?? null,
      source_type: (profile as any).source?.type ?? null,
      summary: profile.summary,
      positions: profile.positions,
      updated_at: profile.last_updated,
    });
  })(req);
