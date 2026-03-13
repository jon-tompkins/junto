import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CREDITS_PER_DEEPDIVE = 5;

// Validate ticker exists using quote API
async function validateTicker(ticker: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Use internal quote API for validation
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/quote?symbol=${ticker}`);
    const data = await response.json();
    
    return {
      valid: data.valid === true,
      error: data.error
    };
  } catch (error) {
    console.error('Ticker validation error:', error);
    // If validation fails, allow the request to proceed (fail open for now)
    return { valid: true };
  }
}

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

    // Validate ticker exists before charging credits
    const validation = await validateTicker(cleanTicker);
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error || 'Ticker not found. Please check the symbol.'
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

    // Fire webhook to Clawdbot for immediate processing (push model)
    try {
      const webhookUrl = process.env.CLAWDBOT_WEBHOOK_URL || 'http://127.0.0.1:18789/hooks/agent';
      const webhookToken = process.env.CLAWDBOT_WEBHOOK_TOKEN || 'myjunto-research-webhook-2026';
      
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${webhookToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `MyJunto research request: Spawn Scout sub-agent for ${cleanTicker}. Request ID: ${researchRequest.id}. After completion, mark as completed via POST https://myjunto.xyz/api/research/process with requestId and status='completed'.`,
          name: 'MyJunto Research',
          sessionKey: `myjunto:research:${researchRequest.id}`,
          wakeMode: 'now',
          deliver: false
        })
      }).catch(err => {
        // Non-fatal: If webhook fails, request is still queued for polling fallback
        console.error('Webhook delivery failed (non-fatal):', err);
      });
    } catch (webhookError) {
      console.error('Webhook error (non-fatal):', webhookError);
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
