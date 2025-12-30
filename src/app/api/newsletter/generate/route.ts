import { NextRequest, NextResponse } from 'next/server';
import { getRecentTweetsGrouped } from '@/lib/db/tweets';
import { storeNewsletter } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { getDateRange } from '@/lib/utils/date';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Optional: get hours from request body
    const body = await request.json().catch(() => ({}));
    const hoursAgo = body.hoursAgo || 24;
    
    console.log(`Generating newsletter for last ${hoursAgo} hours...`);
    
    const { start, end } = getDateRange(hoursAgo);
    const tweets = await getRecentTweetsGrouped(hoursAgo);
    const tweetCount = Object.values(tweets).reduce((sum, arr) => sum + arr.length, 0);
    
    if (tweetCount === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No tweets found in the specified time range',
      });
    }
    
    const synthesis = await generateNewsletter(tweets, start, end);
    
    const newsletter = await storeNewsletter({
      subject: synthesis.subject,
      content: synthesis.content,
      tweet_ids: [],
      tweet_count: tweetCount,
      date_range_start: start,
      date_range_end: end,
      model_used: 'claude-sonnet-4-20250514',
      prompt_version: PROMPT_VERSION,
      input_tokens: synthesis.input_tokens,
      output_tokens: synthesis.output_tokens,
      sent_at: null,
      sent_to: [],
      metadata: {},
    });
    
    return NextResponse.json({
      success: true,
      newsletter: {
        id: newsletter.id,
        subject: newsletter.subject,
        content: newsletter.content,
      },
      stats: {
        tweetCount,
        profiles: Object.keys(tweets),
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

// GET for simple testing without body
export async function GET() {
  return POST(new NextRequest('http://localhost/api/newsletter/generate'));
}
