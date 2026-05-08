import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getUserWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/db/watchlist';

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

// GET /api/v2/star?ticker=BTC — returns starred tickers (or single ticker status)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ starred: false, tickers: [] });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ starred: false, tickers: [] });

    const ticker = req.nextUrl.searchParams.get('ticker');
    const items = await getUserWatchlist(userId);
    const tickers = items.map((i) => i.ticker.toUpperCase());

    if (ticker) {
      return NextResponse.json({ starred: tickers.includes(ticker.toUpperCase()) });
    }
    return NextResponse.json({ tickers });
  } catch (error) {
    console.error('[GET /api/v2/star]', error);
    return NextResponse.json({ starred: false, tickers: [] });
  }
}

// POST /api/v2/star — { ticker }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const { ticker } = await req.json();
    if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

    await addToWatchlist(userId, ticker);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/v2/star]', error);
    return NextResponse.json({ error: 'Failed to star' }, { status: 500 });
  }
}

// DELETE /api/v2/star — { ticker }
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const { ticker } = await req.json();
    if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

    await removeFromWatchlist(userId, ticker);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/v2/star]', error);
    return NextResponse.json({ error: 'Failed to unstar' }, { status: 500 });
  }
}
