import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createWatchlist, getUserWatchlists, getWatchlistWithTickers } from '@/lib/db/watchlists';

async function resolveUser(session: any): Promise<{ id: string; handle: string | null } | null> {
  const supabase = getSupabase();
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;
  if (twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id, twitter_handle, featured_watchlist_id')
      .eq('twitter_id', twitterId)
      .single();
    return data ? { id: data.id, handle: data.twitter_handle } : null;
  }
  if (googleId) {
    const { data } = await supabase
      .from('users')
      .select('id, twitter_handle, featured_watchlist_id')
      .eq('google_id', googleId)
      .single();
    return data ? { id: data.id, handle: data.twitter_handle } : null;
  }
  return null;
}

async function getFeaturedWatchlistId(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('users')
    .select('featured_watchlist_id')
    .eq('id', userId)
    .single();
  return data?.featured_watchlist_id ?? null;
}

// GET /api/v2/featured-watchlist
// Returns the user's primary watchlist with tickers. Auto-creates one if none is set.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const supabase = getSupabase();
    let watchlistId = await getFeaturedWatchlistId(user.id);

    if (!watchlistId) {
      const existing = await getUserWatchlists(user.id);
      if (existing.length > 0) {
        watchlistId = existing[0].id;
      } else {
        const label = user.handle ? `${user.handle}'s Watchlist` : 'My Watchlist';
        const wl = await createWatchlist(user.id, label, 'Your tickers to track.');
        watchlistId = wl.id;
      }
      await supabase
        .from('users')
        .update({ featured_watchlist_id: watchlistId })
        .eq('id', user.id);
    }

    const watchlist = await getWatchlistWithTickers(watchlistId);
    if (!watchlist) return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });

    const allWatchlists = await getUserWatchlists(user.id);
    return NextResponse.json({ watchlist, allWatchlists });
  } catch (err) {
    console.error('[GET /api/v2/featured-watchlist]', err);
    return NextResponse.json({ error: 'Failed to load featured watchlist' }, { status: 500 });
  }
}

// PUT /api/v2/featured-watchlist
// Body: { watchlistId: string }
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { watchlistId } = await req.json();
    if (!watchlistId) return NextResponse.json({ error: 'watchlistId required' }, { status: 400 });

    const supabase = getSupabase();
    const { data: wl } = await supabase
      .from('watchlists')
      .select('id, user_id')
      .eq('id', watchlistId)
      .single();

    if (!wl) return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 });
    if (wl.user_id !== user.id) {
      return NextResponse.json({ error: 'Cannot feature a watchlist you do not own' }, { status: 403 });
    }

    await supabase.from('users').update({ featured_watchlist_id: watchlistId }).eq('id', user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/v2/featured-watchlist]', err);
    return NextResponse.json({ error: 'Failed to update featured watchlist' }, { status: 500 });
  }
}
