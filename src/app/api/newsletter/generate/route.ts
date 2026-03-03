import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getRecentTweetsGrouped, getTweetsForContext } from '@/lib/db/tweets';
import { storeNewsletter } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION, NewsletterContent } from '@/lib/synthesis/generator';
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
    
    // Get user's selected newsletters and recent content
    let newsletterContent: NewsletterContent[] = [];
    try {
      // Get user's newsletter selections
      const { data: userNewsletters } = await supabase
        .from('user_newsletters')
        .select('newsletter_id')
        .eq('user_id', user.id);
      
      if (userNewsletters && userNewsletters.length > 0) {
        const newsletterIds = userNewsletters.map(un => un.newsletter_id);
        
        // Get recent newsletter content (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { data: content } = await supabase
          .from('newsletter_content')
          .select(`
            id,
            subject,
            content,
            received_at,
            available_newsletters!inner(name)
          `)
          .in('newsletter_id', newsletterIds)
          .gte('received_at', sevenDaysAgo.toISOString())
          .order('received_at', { ascending: false })
          .limit(5); // Max 5 newsletter issues
        
        if (content) {
          newsletterContent = content.map((c: any) => ({
            id: c.id,
            name: c.available_newsletters?.name || 'Unknown Newsletter',
            subject: c.subject || 'No Subject',
            content: c.content || '',
            received_at: c.received_at,
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching newsletter content:', err);
      // Continue without newsletter content
    }
    
    console.log(`Including ${newsletterContent.length} newsletter issues in synthesis`);
    
    // Get user's watchlist tweets
    let watchlistTweets: any[] = [];
    try {
      const { data: userWatchlist } = await supabase
        .from('user_watchlist')
        .select('ticker')
        .eq('user_id', user.id);
      
      if (userWatchlist && userWatchlist.length > 0) {
        const tickers = userWatchlist.map(w => w.ticker);
        
        // Get top 3 tweets per ticker from the last 7 days
        const { data: wlTweets } = await supabase
          .from('watchlist_tweets')
          .select('*')
          .in('ticker', tickers)
          .gte('posted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('quality_score', { ascending: false })
          .limit(20); // Limit total watchlist tweets
        
        if (wlTweets) {
          // Group by ticker and take top 3 per ticker
          const tweetsByTicker: Record<string, any[]> = {};
          for (const tweet of wlTweets) {
            if (!tweetsByTicker[tweet.ticker]) {
              tweetsByTicker[tweet.ticker] = [];
            }
            if (tweetsByTicker[tweet.ticker].length < 3) {
              tweetsByTicker[tweet.ticker].push(tweet);
            }
          }
          
          // Flatten back to array
          watchlistTweets = Object.values(tweetsByTicker).flat();
          console.log(`Including ${watchlistTweets.length} watchlist tweets for ${Object.keys(tweetsByTicker).length} tickers`);
        }
      }
    } catch (err) {
      console.error('Error fetching watchlist tweets:', err);
      // Continue without watchlist tweets
    }
    
    // Generate newsletter
    const synthesis = await generateNewsletter(
      recentTweets, 
      start, 
      end, 
      contextTweets,
      keywords,
      customPrompt,
      newsletterContent,
      watchlistTweets
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
      model_used: 'grok-3-fast',
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
// deploy trigger 1772576555
