import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createWatchlist, getUserWatchlists } from '@/lib/db/watchlists';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session.user?.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', session.user.twitterId).single();
    return data?.id || null;
  }
  if (session.user?.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', session.user.googleId).single();
    return data?.id || null;
  }
  return null;
}

// GET /api/v2/watchlists — list authenticated user's watchlists
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const watchlists = await getUserWatchlists(userId);
    return NextResponse.json({ watchlists });
  } catch (error) {
    console.error('[GET /api/v2/watchlists]', error);
    return NextResponse.json({ error: 'Failed to fetch watchlists' }, { status: 500 });
  }
}

// POST /api/v2/watchlists — create a watchlist
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const body = await req.json();
    const { name, description, tickers } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const watchlist = await createWatchlist(userId, name, description);

    if (tickers && Array.isArray(tickers) && tickers.length > 0) {
      const { addTicker } = await import('@/lib/db/watchlists');
      await Promise.all(tickers.map((t: string) => addTicker(watchlist.id, t)));
    }

    return NextResponse.json({ watchlist: { ...watchlist, tickers: tickers || [] } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/v2/watchlists]', error);
    return NextResponse.json({ error: 'Failed to create watchlist' }, { status: 500 });
  }
}
