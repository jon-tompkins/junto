import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CREDITS_PER_SCAN = 10;
const MAX_QUERY_LENGTH = 200;

// POST /api/research/scan - create a new scan (open-ended research) request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const twitterHandle = (session.user as any).twitterHandle;
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Validate query length
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
    if (currentCredits < CREDITS_PER_SCAN) {
      return NextResponse.json({ 
        error: 'Insufficient credits',
        credits: currentCredits,
        required: CREDITS_PER_SCAN
      }, { status: 402 });
    }

    // Deduct credits
    const { error: creditError } = await supabase
      .from('users')
      .update({ credits: currentCredits - CREDITS_PER_SCAN })
      .eq('id', user.id);

    if (creditError) {
      console.error('Error deducting credits:', creditError);
      return NextResponse.json({ error: 'Failed to process credits' }, { status: 500 });
    }

    // Create scan request - using 'scan' as ticker to identify it as a scan
    // The query is stored in the ticker field or we can use a notes/query column
    const { data: researchRequest, error: requestError } = await supabase
      .from('research_requests')
      .insert({
        user_id: user.id,
        ticker: 'SCAN',
        scan_query: cleanQuery,  // Store the actual query
        status: 'pending',
        credits_charged: CREDITS_PER_SCAN,
        request_type: 'scan'
      })
      .select()
      .single();

    if (requestError) {
      // Refund credits on failure
      await supabase
        .from('users')
        .update({ credits: currentCredits })
        .eq('id', user.id);
      
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
      creditsRemaining: currentCredits - CREDITS_PER_SCAN
    });

  } catch (error) {
    console.error('Scan request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
