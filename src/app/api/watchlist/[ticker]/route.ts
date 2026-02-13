import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';

// DELETE /api/watchlist/[ticker] - remove ticker from watchlist
export async function DELETE(
  request: NextRequest, 
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ticker } = await params;
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const cleanTicker = ticker.toUpperCase().trim();

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

    // Remove ticker from watchlist
    const { data, error } = await supabase
      .from('user_watchlist')
      .delete()
      .eq('user_id', users.id)
      .eq('ticker', cleanTicker)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        return NextResponse.json({ error: 'Ticker not found in watchlist' }, { status: 404 });
      }
      console.error('Error removing from watchlist:', error);
      return NextResponse.json({ error: 'Failed to remove ticker' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Ticker removed successfully',
      ticker: data.ticker
    });

  } catch (error) {
    console.error('Watchlist DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}