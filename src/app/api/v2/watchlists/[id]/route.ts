import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getWatchlistWithTickers, updateWatchlist, deleteWatchlist, addTicker, removeTicker } from '@/lib/db/watchlists';

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
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const watchlist = await getWatchlistWithTickers(id);
    if (!watchlist) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (watchlist.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({ watchlist });
  } catch (error) {
    console.error('[GET /api/v2/watchlists/[id]]', error);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}

// PATCH /api/v2/watchlists/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const existing = await getWatchlistWithTickers(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { name, description, tickers } = body;

    let watchlist = existing;
    if (name !== undefined || description !== undefined) {
      const updated = await updateWatchlist(id, { name, description });
      watchlist = { ...updated, tickers: existing.tickers };
    }

    let finalTickers = existing.tickers;
    if (Array.isArray(tickers)) {
      const clean = tickers
        .map((t: string) => String(t).trim().toUpperCase().replace(/^\$/, ''))
        .filter((t: string) => t.length > 0 && t.length <= 12);
      const have = new Set(existing.tickers.map((t) => t.toUpperCase()));
      const want = new Set(clean);
      const toAdd = clean.filter((t) => !have.has(t));
      const toRemove = [...have].filter((t) => !want.has(t));
      await Promise.all([
        ...toAdd.map((t) => addTicker(id, t)),
        ...toRemove.map((t) => removeTicker(id, t)),
      ]);
      finalTickers = clean;
    }

    return NextResponse.json({ watchlist: { ...watchlist, tickers: finalTickers } });
  } catch (error) {
    console.error('[PATCH /api/v2/watchlists/[id]]', error);
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
}

// DELETE /api/v2/watchlists/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const existing = await getWatchlistWithTickers(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await deleteWatchlist(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/watchlists/[id]]', error);
    return NextResponse.json({ error: 'Failed to delete watchlist' }, { status: 500 });
  }
}
