import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { normalizeWatchlistUrl, syncTradingViewForUser } from '@/lib/tradingview';

export const dynamic = 'force-dynamic';

async function resolveUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const u = (session as any)?.user;
  if (!u) return null;
  const supabase = getSupabase();
  if (u.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', u.twitterId).single();
    return data?.id ?? null;
  }
  if (u.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', u.googleId).single();
    return data?.id ?? null;
  }
  return null;
}

export async function GET() {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await getSupabase()
    .from('users').select('tradingview_watchlist_url, tradingview_synced_at').eq('id', userId).single();
  return NextResponse.json({ url: data?.tradingview_watchlist_url ?? null, syncedAt: data?.tradingview_synced_at ?? null });
}

// Save a TradingView share URL and immediately sync it into the myjunto watchlist.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { url?: string } | null;
  const norm = normalizeWatchlistUrl(body?.url || '');
  if (!norm) return NextResponse.json({ error: 'Enter a valid TradingView watchlist share link.' }, { status: 400 });

  await getSupabase().from('users').update({ tradingview_watchlist_url: norm }).eq('id', userId);
  try {
    const { synced } = await syncTradingViewForUser(userId);
    return NextResponse.json({ ok: true, url: norm, synced });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Sync failed. Is the watchlist shared/public?' }, { status: 400 });
  }
}

export async function DELETE() {
  const userId = await resolveUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await getSupabase().from('users').update({ tradingview_watchlist_url: null }).eq('id', userId);
  return NextResponse.json({ ok: true });
}
