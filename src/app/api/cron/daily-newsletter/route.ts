import { NextRequest, NextResponse } from 'next/server';
import { getRecentTweetsGrouped } from '@/lib/db/tweets';
import { storeNewsletter, updateNewsletterSentStatus } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { sendNewsletter } from '@/lib/email/sender';
import { config } from '@/lib/utils/config';
import { getDateRange } from '@/lib/utils/date';

export const maxDuration = 60; // Allow up to 60 seconds for this route

export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (config.app.cronSecret && authHeader !== `Bearer ${config.app.cronSecret}`) {
    // Also check for Vercel cron header
    const cronHeader = request.headers.get('x-vercel-cron');
    if (!cronHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    console.log('Starting daily newsletter generation...');
    
    // Get date range
    const { start, end } = getDateRange(24);
    
    // Fetch recent tweets grouped by profile
    const tweets = await getRecentTweetsGrouped(24);
    const tweetCount = Object.values(tweets).reduce((sum, arr) => sum + arr.length, 0);
    
    if (tweetCount === 0) {
      console.log('No tweets found in the last 24 hours');
      return NextResponse.json({ 
        success: true, 
        message: 'No tweets to process',
        tweetCount: 0,
      });
    }
    
    console.log(`Found ${tweetCount} tweets from ${Object.keys(tweets).length} profiles`);
    
    // Generate newsletter
    const synthesis = await generateNewsletter(tweets, start, end);
    
    // Get tweet IDs for reference (we'd need to track these better in production)
    const tweetIds: string[] = []; // Simplified for now
    
    // Store newsletter
    const newsletter = await storeNewsletter({
      subject: synthesis.subject,
      content: synthesis.content,
      tweet_ids: tweetIds,
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
    
    console.log(`Newsletter stored with ID: ${newsletter.id}`);
    
    // Send email
    const recipient = config.app.newsletterRecipient;
    if (recipient) {
      await sendNewsletter({
        to: recipient,
        subject: synthesis.subject,
        content: synthesis.content,
      });
      
      await updateNewsletterSentStatus(newsletter.id, [recipient]);
      console.log(`Newsletter sent to ${recipient}`);
    } else {
      console.log('No recipient configured, skipping email send');
    }
    
    return NextResponse.json({
      success: true,
      newsletterId: newsletter.id,
      subject: synthesis.subject,
      tweetCount,
      profiles: Object.keys(tweets),
      tokens: {
        input: synthesis.input_tokens,
        output: synthesis.output_tokens,
      },
    });
    
  } catch (error) {
    console.error('Error in daily newsletter cron:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
