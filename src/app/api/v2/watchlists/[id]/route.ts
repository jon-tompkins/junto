import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getWatchlistWithTickers, updateWatchlist, deleteWatchlist } from '@/lib/db/watchlists';

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

// GET /api/v2/watchlists/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const watchlist = await getWatchlistWithTickers(params.id);
    if (!watchlist) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (watchlist.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({ watchlist });
  } catch (error) {
    console.error('[GET /api/v2/watchlists/[id]]', error);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}

// PATCH /api/v2/watchlists/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const existing = await getWatchlistWithTickers(params.id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { name, description } = body;
    const watchlist = await updateWatchlist(params.id, { name, description });

    return NextResponse.json({ watchlist: { ...watchlist, tickers: existing.tickers } });
  } catch (error) {
    console.error('[PATCH /api/v2/watchlists/[id]]', error);
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
}

// DELETE /api/v2/watchlists/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const existing = await getWatchlistWithTickers(params.id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await deleteWatchlist(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/watchlists/[id]]', error);
    return NextResponse.json({ error: 'Failed to delete watchlist' }, { status: 500 });
  }
}
