import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';

// GET /api/watchlist/tweets - get recent quality tweets for user's watchlist
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const daysBack = parseInt(url.searchParams.get('days') || '7');

    const supabase = getSupabase();

    // Get user ID from email
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userError || !users) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's watchlist tickers
    const { data: watchlist, error: watchlistError } = await supabase
      .from('user_watchlist')
      .select('ticker')
      .eq('user_id', users.id);

    if (watchlistError) {
      console.error('Error fetching user watchlist:', watchlistError);
      return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
    }

    if (!watchlist || watchlist.length === 0) {
      return NextResponse.json({ 
        tweets: [],
        message: 'No tickers in watchlist'
      });
    }

    const tickers = watchlist.map(w => w.ticker);

    // Calculate date range
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    // Get recent tweets for watchlist tickers
    const { data: tweets, error: tweetsError } = await supabase
      .from('watchlist_tweets')
      .select('*')
      .in('ticker', tickers)
      .gte('posted_at', sinceDate.toISOString())
      .order('quality_score', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(limit);

    if (tweetsError) {
      console.error('Error fetching watchlist tweets:', tweetsError);
      return NextResponse.json({ error: 'Failed to fetch tweets' }, { status: 500 });
    }

    // Group tweets by ticker for better organization
    const tweetsByTicker: Record<string, any[]> = {};
    for (const tweet of tweets || []) {
      if (!tweetsByTicker[tweet.ticker]) {
        tweetsByTicker[tweet.ticker] = [];
      }
      tweetsByTicker[tweet.ticker].push(tweet);
    }

    return NextResponse.json({ 
      tweets: tweets || [],
      tweetsByTicker,
      watchlistTickers: tickers,
      totalTweets: tweets?.length || 0,
      dateRange: {
        from: sinceDate.toISOString(),
        to: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Watchlist tweets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}