import { NextResponse } from 'next/server';
import { getAllProfilesWithSources } from '@/lib/db/source-analyst-profiles';

export async function GET() {
  try {
    const profiles = await getAllProfilesWithSources();
    return NextResponse.json({ profiles });
  } catch (err) {
    console.error('[api/sources]', err);
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
  }
}
