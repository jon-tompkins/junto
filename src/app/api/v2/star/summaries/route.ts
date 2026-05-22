import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ items: [] });

  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ items: [] });

  const watchlist = await getUserWatchlist(userId);
  const tickers = watchlist.map((w) => w.ticker.toUpperCase());
  if (tickers.length === 0) return NextResponse.json({ items: [] });

  const { data: summaries } = await getSupabase()
    .from('ticker_summaries')
    .select('ticker, summary, tweet_count, last_report_at, updated_at')
    .in('ticker', tickers);

  const byTicker: Record<string, any> = {};
  for (const s of summaries || []) byTicker[s.ticker.toUpperCase()] = s;

  const items = tickers.map((t) => ({
    ticker: t,
    summary: byTicker[t]?.summary || null,
    tweet_count: byTicker[t]?.tweet_count ?? 0,
    last_report_at: byTicker[t]?.last_report_at || null,
  }));

  return NextResponse.json({ items });
}
