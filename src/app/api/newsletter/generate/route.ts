import { NextRequest, NextResponse } from 'next/server';
import { getRecentTweetsGrouped, getTweetsForContext } from '@/lib/db/tweets';
import { storeNewsletter } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { getDateRange } from '@/lib/utils/date';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    // Recent tweets (last 24-48 hours) - primary focus
    const recentHours = body.recentHours || 48;
    // Context tweets (last 6 months) - background context
    const contextDays = body.contextDays || 180;
    
    console.log(`Generating newsletter: ${recentHours}hr recent + ${contextDays} day context...`);
    
    const { start: recentStart, end } = getDateRange(recentHours);
    
    // Get recent tweets (primary focus)
    const recentTweets = await getRecentTweetsGrouped(recentHours);
    const recentCount = Object.values(recentTweets).reduce((sum, arr) => sum + arr.length, 0);
    
    // Get older context tweets (6 months, excluding recent)
    const contextTweets = await getTweetsForContext(contextDays, recentHours);
    const contextCount = Object.values(contextTweets).reduce((sum, arr) => sum + arr.length, 0);
    
    const totalCount = recentCount + contextCount;
    
    if (totalCount === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No tweets found in the specified time range',
      });
    }
    
    // Pass both recent and context tweets to generator
    const synthesis = await generateNewsletter(recentTweets, recentStart, end, contextTweets);
    
    const newsletter = await storeNewsletter({
      subject: synthesis.subject,
      content: synthesis.content,
      tweet_ids: [],
      tweet_count: totalCount,
      date_range_start: recentStart,
      date_range_end: end,
      model_used: 'claude-sonnet-4-20250514',
      prompt_version: PROMPT_VERSION,
      input_tokens: synthesis.input_tokens,
      output_tokens: synthesis.output_tokens,
      sent_at: null,
      sent_to: [],
      metadata: {
        recent_tweets: recentCount,
        context_tweets: contextCount,
      },
    });
    
    return NextResponse.json({
      success: true,
      newsletter: {
        id: newsletter.id,
        subject: newsletter.subject,
        content: newsletter.content,
      },
      stats: {
        tweetCount: totalCount,
        recentTweets: recentCount,
        contextTweets: contextCount,
        profiles: Object.keys(recentTweets),
        tokens: {
          input: synthesis.input_tokens,
          output: synthesis.output_tokens,
        },
      },
    });
    
  } catch (error) {
    console.error('Error generating newsletter:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET for simple testing
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const recentHours = parseInt(searchParams.get('recent') || '48');
  const contextDays = parseInt(searchParams.get('context') || '180');
  
  const mockRequest = new NextRequest('http://localhost/api/newsletter/generate', {
    method: 'POST',
    body: JSON.stringify({ recentHours, contextDays }),
  });
  
  return POST(mockRequest);
}
