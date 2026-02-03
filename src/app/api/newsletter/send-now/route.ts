import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getRecentTweetsGrouped, getTweetsForContext } from '@/lib/db/tweets';
import { storeNewsletter } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { sendNewsletter } from '@/lib/email/sender';
import { getDateRange } from '@/lib/utils/date';
import { validateConfig } from '@/lib/utils/config';

export const maxDuration = 300;

// POST /api/newsletter/send-now
// Body: { email: "user@example.com" }
// Force sends a newsletter to the specified user immediately

export async function POST(request: NextRequest) {
  try {
    validateConfig('supabase');
    validateConfig('resend');
    validateConfig('anthropic');
    
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    
    const supabase = getSupabase();
    
    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'User not found', details: userError }, { status: 404 });
    }
    
    console.log(`📧 Force sending newsletter to ${email}`);
    
    // Get user's selected profiles
    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('profiles(twitter_handle)')
      .eq('user_id', user.id);
    
    const profileHandles = userProfiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
    
    if (profileHandles.length === 0) {
      return NextResponse.json({ 
        error: 'No profiles selected',
        message: 'User has no Twitter profiles to follow. Please select profiles first.'
      }, { status: 400 });
    }
    
    console.log(`Found ${profileHandles.length} profiles: ${profileHandles.join(', ')}`);
    
    // Generate newsletter
    const settings = user.settings || {};
    const keywords = settings.keywords || [];
    const customPrompt = user.custom_prompt || null;
    const recentHours = 48;
    const contextDays = 180;
    
    const { start, end } = getDateRange(recentHours);
    
    const allRecentTweets = await getRecentTweetsGrouped(recentHours);
    const allContextTweets = await getTweetsForContext(contextDays, recentHours);
    
    const recentTweets: Record<string, any[]> = {};
    const contextTweets: Record<string, any[]> = {};
    
    for (const handle of profileHandles) {
      if (allRecentTweets[handle]) {
        recentTweets[handle] = allRecentTweets[handle];
      }
      if (allContextTweets[handle]) {
        contextTweets[handle] = allContextTweets[handle];
      }
    }
    
    const recentCount = Object.values(recentTweets).reduce((sum, arr) => sum + arr.length, 0);
    const contextCount = Object.values(contextTweets).reduce((sum, arr) => sum + arr.length, 0);
    const totalCount = recentCount + contextCount;
    
    if (totalCount === 0) {
      return NextResponse.json({
        error: 'No tweets found',
        message: 'No tweets available from followed profiles in the time range',
        profiles: profileHandles
      }, { status: 400 });
    }
    
    console.log(`Generating newsletter from ${totalCount} tweets (${recentCount} recent, ${contextCount} context)`);
    
    const synthesis = await generateNewsletter(
      recentTweets,
      start,
      end,
      contextTweets,
      keywords,
      customPrompt
    );
    
    // Store newsletter
    const newsletter = await storeNewsletter({
      user_id: user.id,
      subject: synthesis.subject,
      content: synthesis.content,
      tweet_ids: [],
      tweet_count: totalCount,
      date_range_start: start,
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
        profiles: profileHandles,
        keywords,
        manual_send: true
      },
    });
    
    // Send email
    const emailResult = await sendNewsletter({
      to: email,
      subject: synthesis.subject,
      content: synthesis.content,
      date: new Date().toISOString(),
    });
    
    // Update newsletter and user records
    await supabase
      .from('newsletters')
      .update({
        sent_at: new Date().toISOString(),
        sent_to: [email],
      })
      .eq('id', newsletter.id);
    
    await supabase
      .from('users')
      .update({
        last_newsletter_sent: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    console.log(`✅ Newsletter sent to ${email}`);
    
    return NextResponse.json({
      success: true,
      message: `Newsletter sent to ${email}`,
      newsletterId: newsletter.id,
      emailId: emailResult.id,
      stats: {
        profiles: profileHandles.length,
        tweets: totalCount,
        subject: synthesis.subject
      }
    });
    
  } catch (error) {
    console.error('Send-now error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}
