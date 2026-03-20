import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CREDITS_PER_DEEPDIVE = 5;

// Validate ticker exists using quote API
async function validateTicker(ticker: string): Promise<{ valid: boolean; error?: string; price?: number }> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

    const response = await fetch(`${baseUrl}/api/quote?symbol=${ticker}`);
    const data = await response.json();

    return {
      valid: data.valid === true,
      error: data.error,
      price: data.price
    };
  } catch (error) {
    console.error('Ticker validation error:', error);
    // Fail open — let the processor validate again
    return { valid: true };
  }
}

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session.user.twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_id', session.user.twitterId)
      .single();
    return data?.id || null;
  }
  if (session.user.googleId) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('google_id', session.user.googleId)
      .single();
    return data?.id || null;
  }
  return null;
}

// POST /api/research/request - create a new deep dive request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { ticker } = await request.json();

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const cleanTicker = ticker.toUpperCase().trim();
    if (!/^[A-Z]{1,10}$/.test(cleanTicker)) {
      return NextResponse.json({ error: 'Invalid ticker format' }, { status: 400 });
    }

    // Validate ticker exists
    const validation = await validateTicker(cleanTicker);
    if (!validation.valid) {
      return NextResponse.json({
        error: validation.error || 'Ticker not found. Please check the symbol.'
      }, { status: 400 });
    }

    const supabase = getSupabase();

    // Check credit balance (don't deduct yet — charge on completion)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, credit_balance')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentCredits = user.credit_balance ?? 0;
    if (currentCredits < CREDITS_PER_DEEPDIVE) {
      return NextResponse.json({
        error: 'Insufficient credits',
        credits: currentCredits,
        required: CREDITS_PER_DEEPDIVE
      }, { status: 402 });
    }

    // Check for duplicate pending/processing request
    const { data: existing } = await supabase
      .from('research_requests')
      .select('id, status')
      .eq('user_id', userId)
      .eq('ticker', cleanTicker)
      .in('status', ['pending', 'processing'])
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'You already have a pending request for this ticker',
        requestId: existing.id
      }, { status: 409 });
    }

    // Create request — credits will be deducted when report completes
    const { data: researchRequest, error: requestError } = await supabase
      .from('research_requests')
      .insert({
        user_id: userId,
        ticker: cleanTicker,
        status: 'pending',
        credits_charged: 0, // Will be set on completion
      })
      .select()
      .single();

    if (requestError) {
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
      creditsRemaining: currentCredits,
    });

  } catch (error) {
    console.error('Research request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
