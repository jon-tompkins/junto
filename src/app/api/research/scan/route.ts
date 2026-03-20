import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CREDITS_PER_SCAN = 10;
const MAX_QUERY_LENGTH = 200;

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

// POST /api/research/scan - create a new scan (open-ended research) request
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

    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const cleanQuery = query.trim();
    if (cleanQuery.length === 0) {
      return NextResponse.json({ error: 'Query cannot be empty' }, { status: 400 });
    }
    if (cleanQuery.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({
        error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters allowed.`,
        maxLength: MAX_QUERY_LENGTH,
        currentLength: cleanQuery.length
      }, { status: 400 });
    }

    const supabase = getSupabase();

    // Check credit balance (don't deduct — charge on completion)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, credit_balance')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentCredits = user.credit_balance ?? 0;
    if (currentCredits < CREDITS_PER_SCAN) {
      return NextResponse.json({
        error: 'Insufficient credits',
        credits: currentCredits,
        required: CREDITS_PER_SCAN
      }, { status: 402 });
    }

    // Create scan request — credits deducted on completion
    const { data: researchRequest, error: requestError } = await supabase
      .from('research_requests')
      .insert({
        user_id: userId,
        ticker: 'SCAN',
        scan_query: cleanQuery,
        status: 'pending',
        credits_charged: 0,
        request_type: 'scan'
      })
      .select()
      .single();

    if (requestError) {
      console.error('Error creating scan request:', requestError);
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Scan requested successfully',
      request: {
        id: researchRequest.id,
        query: cleanQuery,
        status: researchRequest.status,
        created_at: researchRequest.created_at
      },
      creditsRemaining: currentCredits
    });

  } catch (error) {
    console.error('Scan request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
