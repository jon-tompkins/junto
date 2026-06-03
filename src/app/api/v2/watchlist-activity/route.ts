import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

// GET /api/v2/watchlist-activity?watchlist_id=...
// Returns recent watchlist_tweets for the given watchlist's tickers (last 7d).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const watchlistId = url.searchParams.get('watchlist_id');
  if (!watchlistId) return NextResponse.json({ tweets: [] });

  const supabase = getSupabase();
  const { data: wl } = await supabase
    .from('user_watchlists')
    .select('tickers')
    .eq('id', watchlistId)
    .single();

  const tickers: string[] = wl?.tickers || [];
  if (tickers.length === 0) return NextResponse.json({ tweets: [] });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('watchlist_tweets')
    .select('ticker, tweet_id, author_handle, author_name, content, posted_at, likes, retweets')
    .in('ticker', tickers.map((t) => t.toUpperCase()))
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message, tweets: [] }, { status: 500 });
  }

  return NextResponse.json({ tweets: data || [] });
}
