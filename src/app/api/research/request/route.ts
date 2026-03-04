import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CREDITS_PER_DEEPDIVE = 5;

// POST /api/research/request - create a new deep dive request
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

    // Validate ticker format
    const cleanTicker = ticker.toUpperCase().trim();
    if (!/^[A-Z]{1,10}$/.test(cleanTicker)) {
      return NextResponse.json({ error: 'Invalid ticker format' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, credits')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check credits
    const currentCredits = user.credits ?? 0;
    if (currentCredits < CREDITS_PER_DEEPDIVE) {
      return NextResponse.json({ 
        error: 'Insufficient credits',
        credits: currentCredits,
        required: CREDITS_PER_DEEPDIVE
      }, { status: 402 });
    }

    // Check if user already has a pending request for this ticker
    const { data: existing } = await supabase
      .from('research_requests')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('ticker', cleanTicker)
      .in('status', ['pending', 'processing'])
      .single();

    if (existing) {
      return NextResponse.json({ 
        error: 'You already have a pending request for this ticker',
        requestId: existing.id
      }, { status: 409 });
    }

    // Deduct credits
    const { error: creditError } = await supabase
      .from('users')
      .update({ credits: currentCredits - CREDITS_PER_DEEPDIVE })
      .eq('id', user.id);

    if (creditError) {
      console.error('Error deducting credits:', creditError);
      return NextResponse.json({ error: 'Failed to process credits' }, { status: 500 });
    }

    // Create request
    const { data: researchRequest, error: requestError } = await supabase
      .from('research_requests')
      .insert({
        user_id: user.id,
        ticker: cleanTicker,
        status: 'pending',
        credits_charged: CREDITS_PER_DEEPDIVE
      })
      .select()
      .single();

    if (requestError) {
      // Refund credits on failure
      await supabase
        .from('users')
        .update({ credits: currentCredits })
        .eq('id', user.id);
      
      console.error('Error creating request:', requestError);
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Deep dive requested successfully',
      request: {
        id: researchRequest.id,
        ticker: researchRequest.ticker,
        status: researchRequest.status,
        created_at: researchRequest.created_at
      },
      creditsRemaining: currentCredits - CREDITS_PER_DEEPDIVE
    });

  } catch (error) {
    console.error('Research request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
