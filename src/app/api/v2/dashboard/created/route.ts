import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getUserNewsletters } from '@/lib/db/newsletters-v2';

// GET /api/v2/dashboard/created — get newsletters created by current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve DB user ID from twitter_id
    const twitterId = (session.user as any).twitterId;
    if (!twitterId) {
      return NextResponse.json({ newsletters: [] });
    }

    const { data: user } = await getSupabase()
      .from('users')
      .select('id')
      .eq('twitter_id', twitterId)
      .single();

    if (!user) {
      return NextResponse.json({ newsletters: [] });
    }

    const newsletters = await getUserNewsletters(user.id);
    return NextResponse.json({ newsletters });
  } catch (error) {
    console.error('[GET /dashboard/created]', error);
    return NextResponse.json({ error: 'Failed to load newsletters' }, { status: 500 });
  }
}
