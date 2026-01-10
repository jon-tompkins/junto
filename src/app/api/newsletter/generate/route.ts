import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getRecentTweetsGrouped, getTweetsForContext } from '@/lib/db/tweets';
import { storeNewsletter } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { getDateRange } from '@/lib/utils/date';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const recentHours = body.recentHours || 48;
    const contextDays = body.contextDays || 180;
    
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    
    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id, settings, custom_prompt')
      .eq('twitter_handle', twitterHandle)
      .single();
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Get user's selected profiles
    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('profiles(twitter_handle)')
      .eq('user_id', user.id);
    
    const profileHandles = userProfiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
    
    if (profileHandles.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No profiles selected. Add profiles in Sources.',
      });
    }
    
    console.log(`Generating newsletter for ${twitterHandle} with profiles: ${profileHandles.join(', ')}`);
    
    const { start, end } = getDateRange(recentHours);
    
    // Get all tweets then filter to user's profiles
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
        success: false, 
        message: 'No tweets found for your selected profiles in the specified time range',
      });
    }
    
    // Get user's keywords and custom prompt
    const keywords = user.settings?.keywords || [];
    const customPrompt = user.custom_prompt || null;
    
    // Generate newsletter
    const synthesis = await generateNewsletter(
      recentTweets, 
      start, 
      end, 
      contextTweets,
      keywords,
      customPrompt
    );
    
    // Store newsletter with user_id
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
        profiles: profileHandles,
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
  return POST(request);
}
