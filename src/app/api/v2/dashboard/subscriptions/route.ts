import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getUserSubscriptions } from '@/lib/db/subscriptions';

// GET /api/v2/dashboard/subscriptions — get current user's subscriptions
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve DB user ID from twitter_id
    const twitterId = (session.user as any).twitterId;
    if (!twitterId) {
      return NextResponse.json({ subscriptions: [] });
    }

    const { data: user } = await getSupabase()
      .from('users')
      .select('id')
      .eq('twitter_id', twitterId)
      .single();

    if (!user) {
      return NextResponse.json({ subscriptions: [] });
    }

    const subscriptions = await getUserSubscriptions(user.id);
    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error('[GET /dashboard/subscriptions]', error);
    return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 });
  }
}
