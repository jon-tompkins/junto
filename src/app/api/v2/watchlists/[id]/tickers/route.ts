import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getWatchlist, addTicker, removeTicker, getWatchlistTickers } from '@/lib/db/watchlists';

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

async function assertOwner(watchlistId: string, userId: string): Promise<boolean> {
  const w = await getWatchlist(watchlistId);
  return w?.user_id === userId;
}

// POST /api/v2/watchlists/[id]/tickers — add a ticker
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });
    if (!await assertOwner(params.id, userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { ticker } = body;
    if (!ticker) return NextResponse.json({ error: 'ticker is required' }, { status: 400 });

    await addTicker(params.id, ticker);
    const tickers = await getWatchlistTickers(params.id);
    return NextResponse.json({ tickers }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/v2/watchlists/[id]/tickers]', error);
    return NextResponse.json({ error: 'Failed to add ticker' }, { status: 500 });
  }
}

// DELETE /api/v2/watchlists/[id]/tickers — remove a ticker (?ticker=OXY)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });
    if (!await assertOwner(params.id, userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const ticker = req.nextUrl.searchParams.get('ticker');
    if (!ticker) return NextResponse.json({ error: 'ticker query param is required' }, { status: 400 });

    await removeTicker(params.id, ticker);
    const tickers = await getWatchlistTickers(params.id);
    return NextResponse.json({ tickers });
  } catch (error) {
    console.error('[DELETE /api/v2/watchlists/[id]/tickers]', error);
    return NextResponse.json({ error: 'Failed to remove ticker' }, { status: 500 });
  }
}
