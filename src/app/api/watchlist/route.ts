import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET /api/watchlist - list user's watchlist tickers
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;

    // Get user ID from twitter handle
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (userError || !users) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's watchlist
    const { data: watchlist, error } = await supabase
      .from('user_watchlist')
      .select('ticker, created_at')
      .eq('user_id', users.id)
      .order('ticker');

    if (error) {
      console.error('Error fetching watchlist:', error);
      return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
    }

    return NextResponse.json({ watchlist: watchlist || [] });

  } catch (error) {
    console.error('Watchlist GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/watchlist - add ticker to watchlist
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const twitterHandle = (session.user as any).twitterHandle;
    const { ticker } = await request.json();
    
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    // Validate ticker format (basic validation)
    const cleanTicker = ticker.toUpperCase().trim();
    if (!/^[A-Z]{1,10}$/.test(cleanTicker)) {
      return NextResponse.json({ error: 'Invalid ticker format' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Get user ID from twitter handle
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (userError || !users) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Add ticker to watchlist
    const { data, error } = await supabase
      .from('user_watchlist')
      .insert({
        user_id: users.id,
        ticker: cleanTicker
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ error: 'Ticker already in watchlist' }, { status: 409 });
      }
      console.error('Error adding to watchlist:', error);
      return NextResponse.json({ error: 'Failed to add ticker' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Ticker added successfully',
      ticker: data.ticker,
      created_at: data.created_at
    });

  } catch (error) {
    console.error('Watchlist POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}