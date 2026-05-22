import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getTickerSummary, listTickerReports } from '@/lib/db/ticker-reports';
import { getUserWatchlist } from '@/lib/db/watchlist';

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

async function gate(ticker: string): Promise<NextResponse | { userId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

  const { data: user } = await getSupabase().from('users').select('is_pro').eq('id', userId).single();
  if (!user?.is_pro) return NextResponse.json({ error: 'Pro subscription required' }, { status: 402 });

  const watchlist = await getUserWatchlist(userId);
  const tickers = watchlist.map((w) => w.ticker.toUpperCase());
  if (!tickers.includes(ticker.toUpperCase())) {
    return NextResponse.json({ error: 'Ticker not in your watchlist' }, { status: 403 });
  }

  return { userId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();
  const gated = await gate(ticker);
  if (gated instanceof NextResponse) return gated;

  const [summary, reports] = await Promise.all([
    getTickerSummary(ticker),
    listTickerReports(ticker, 30),
  ]);

  return NextResponse.json({ ticker, summary, reports });
}
