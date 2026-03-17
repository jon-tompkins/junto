import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getXAI } from '@/lib/synthesis/client';

const CREDITS_PER_DEEPDIVE = 5;

interface TwitterSentiment {
  overallScore: number;
  overallMood: string;
  volume: string;
  keyThemes: {
    bullish: string[];
    bearish: string[];
  };
  notableMentions: Array<{
    handle: string;
    quote: string;
    likes: string;
  }>;
  trendingHashtags: string[];
}

// Validate ticker exists using quote API
async function validateTicker(ticker: string): Promise<{ valid: boolean; error?: string }> {
  try {
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
    return { valid: true };
  }
}

// Fetch Twitter sentiment for a ticker
async function fetchTwitterSentiment(ticker: string): Promise<TwitterSentiment | null> {
  try {
    const client = getXAI();
    
    const prompt = `Analyze current Twitter/X sentiment for ticker $${ticker}.

Provide a JSON response with this structure:
{
  "overallScore": number from -10 to +10,
  "overallMood": "Very Bullish" | "Bullish" | "Neutral" | "Bearish" | "Very Bearish",
  "volume": "Low" | "Medium" | "High",
  "keyThemes": {
    "bullish": ["theme 1", "theme 2", "theme 3"],
    "bearish": ["concern 1", "concern 2"]
  },
  "notableMentions": [
    {"handle": "@username", "quote": "key insight", "likes": "15K"}
  ],
  "trendingHashtags": ["#hashtag1", "#hashtag2"]
}

Focus on:
- Real-time sentiment from the last 24-48 hours
- Key arguments being made by bulls and bears
- Any notable smart money or influencer mentions
- Trending hashtags related to the ticker

Return valid JSON only.`;

    const response = await client.chat.completions.create({
      model: 'grok-3-fast',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    });
    
    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    console.error('Twitter sentiment fetch failed:', error);
    return null;
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

    const cleanTicker = ticker.toUpperCase().trim();
    if (!/^[A-Z]{1,10}$/.test(cleanTicker)) {
      return NextResponse.json({ error: 'Invalid ticker format' }, { status: 400 });
    }

    const validation = await validateTicker(cleanTicker);
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error || 'Ticker not found. Please check the symbol.'
      }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, credits')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentCredits = user.credits ?? 0;
    if (currentCredits < CREDITS_PER_DEEPDIVE) {
      return NextResponse.json({ 
        error: 'Insufficient credits',
        credits: currentCredits,
        required: CREDITS_PER_DEEPDIVE
      }, { status: 402 });
    }

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

    const { error: creditError } = await supabase
      .from('users')
      .update({ credits: currentCredits - CREDITS_PER_DEEPDIVE })
      .eq('id', user.id);

    if (creditError) {
      console.error('Error deducting credits:', creditError);
      return NextResponse.json({ error: 'Failed to process credits' }, { status: 500 });
    }

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
      await supabase
        .from('users')
        .update({ credits: currentCredits })
        .eq('id', user.id);
      
      console.error('Error creating request:', requestError);
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
    }

    // Fetch Twitter sentiment immediately for richer webhook context
    const sentiment = await fetchTwitterSentiment(cleanTicker);

    // Fire webhook via Telegram to OpenClaw/Benji for immediate processing
    try {
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      if (telegramBotToken && chatId) {
        let message = `🔍 RESEARCH REQUEST\nTicker: ${cleanTicker}\nRequest ID: ${researchRequest.id}\nUser: ${twitterHandle}`;
        
        if (sentiment) {
          message += `\n\n📊 Twitter Sentiment: ${sentiment.overallMood} (${sentiment.overallScore}/10)`;
          message += `\nVolume: ${sentiment.volume}`;
          if (sentiment.keyThemes.bullish.length > 0) {
            message += `\n🐂 Bullish: ${sentiment.keyThemes.bullish[0]}`;
          }
          if (sentiment.keyThemes.bearish.length > 0) {
            message += `\n🐻 Bearish: ${sentiment.keyThemes.bearish[0]}`;
          }
        }
        
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
          })
        });
        console.log(`Telegram webhook sent for ${cleanTicker} with sentiment`);
      } else {
        console.warn('Telegram credentials not configured, skipping webhook');
      }
    } catch (webhookError) {
      console.error('Telegram webhook error (non-fatal):', webhookError);
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