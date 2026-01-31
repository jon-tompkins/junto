import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getRecentTweetsGrouped, getTweetsForContext } from '@/lib/db/tweets';
import { storeNewsletter } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { getDateRange } from '@/lib/utils/date';
import { sendNewsletter } from '@/lib/email/sender';

export const maxDuration = 300; // 5 minutes for cron job

// This endpoint is called by cron - no authentication required
export async function GET(request: NextRequest) {
  console.log('🕐 Starting scheduled newsletter check...');
  const startTime = Date.now();
  
  try {
    const supabase = getSupabase();
    
    // Get users due for newsletters using the database function
    const { data: dueUsers, error: usersError } = await supabase
      .rpc('get_users_due_for_newsletter');
    
    if (usersError) {
      console.error('Error getting due users:', usersError);
      throw usersError;
    }
    
    console.log(`📋 Found ${dueUsers?.length || 0} users due for newsletters`);
    
    let newslettersQueued = 0;
    let newslettersSent = 0;
    let errorsCount = 0;
    const errors: string[] = [];
    
    if (dueUsers && dueUsers.length > 0) {
      for (const user of dueUsers) {
        try {
          console.log(`📰 Processing newsletter for user ${user.email}`);
          
          // Get user's selected profiles for newsletter generation
          const { data: userProfiles } = await supabase
            .from('user_profiles')
            .select('profiles(twitter_handle)')
            .eq('user_id', user.user_id);
          
          const profileHandles = userProfiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
          
          if (profileHandles.length === 0) {
            console.log(`⚠️ User ${user.email} has no profiles selected, skipping`);
            continue;
          }
          
          // Get user settings for newsletter customization
          const { data: userData } = await supabase
            .from('users')
            .select('settings, custom_prompt')
            .eq('id', user.user_id)
            .single();
          
          const keywords = userData?.settings?.keywords || [];
          const customPrompt = userData?.custom_prompt || null;
          
          // Generate newsletter content
          const recentHours = 48; // Default to 48 hours for scheduled newsletters
          const contextDays = 180;
          const { start, end } = getDateRange(recentHours);
          
          // Get tweets for the user's selected profiles
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
            console.log(`⚠️ No tweets found for user ${user.email}, skipping`);
            continue;
          }
          
          // Generate newsletter
          console.log(`🤖 Generating newsletter for ${user.email} with ${totalCount} tweets`);
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
            user_id: user.user_id,
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
              scheduled: true,
              local_send_time: user.local_send_time,
              timezone: user.timezone,
            },
          });
          
          newslettersQueued++;
          
          // Send the newsletter
          console.log(`📧 Sending newsletter to ${user.email}`);
          const emailResult = await sendNewsletter({
            to: user.email,
            subject: newsletter.subject,
            content: newsletter.content,
            date: newsletter.generated_at,
          });
          
          // Update newsletter with sent status
          await supabase
            .from('newsletters')
            .update({
              sent_at: new Date().toISOString(),
              sent_to: [user.email],
            })
            .eq('id', newsletter.id);
          
          // Mark newsletter as sent in queue (if using queue system)
          await supabase
            .rpc('mark_newsletter_sent', {
              p_queue_id: null, // We're not using queue IDs for direct scheduling
              p_newsletter_id: newsletter.id
            });
          
          // Update user's last newsletter sent date
          await supabase
            .from('users')
            .update({
              last_newsletter_sent: new Date().toISOString().split('T')[0], // Today's date
            })
            .eq('id', user.user_id);
          
          newslettersSent++;
          console.log(`✅ Successfully sent newsletter to ${user.email}`);
          
        } catch (userError) {
          errorsCount++;
          const errorMsg = `Error processing user ${user.email}: ${userError instanceof Error ? userError.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // Log the scheduling run
    await supabase
      .from('scheduling_logs')
      .insert({
        users_checked: dueUsers?.length || 0,
        users_matched: dueUsers?.length || 0,
        newsletters_queued: newslettersQueued,
        newsletters_sent: newslettersSent,
        errors_count: errorsCount,
        processing_time_ms: processingTime,
        details: {
          errors: errors.length > 0 ? errors : undefined,
          timestamp: new Date().toISOString(),
          run_type: 'scheduled_check',
        }
      });
    
    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      processing_time_ms: processingTime,
      stats: {
        users_checked: dueUsers?.length || 0,
        users_matched: dueUsers?.length || 0,
        newsletters_queued: newslettersQueued,
        newsletters_sent: newslettersSent,
        errors_count: errorsCount,
      },
      errors: errors.length > 0 ? errors : undefined,
    };
    
    console.log('📊 Scheduling run complete:', summary);
    
    return NextResponse.json(summary);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Scheduled newsletter check failed:', errorMsg);
    
    // Log the error
    try {
      const supabase = getSupabase();
      await supabase
        .from('scheduling_logs')
        .insert({
          users_checked: 0,
          users_matched: 0,
          newsletters_queued: 0,
          newsletters_sent: 0,
          errors_count: 1,
          processing_time_ms: processingTime,
          details: {
            error: errorMsg,
            timestamp: new Date().toISOString(),
            run_type: 'scheduled_check',
          }
        });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMsg,
        timestamp: new Date().toISOString(),
        processing_time_ms: processingTime,
      },
      { status: 500 }
    );
  }
}

// Also support POST for testing
export async function POST(request: NextRequest) {
  return GET(request);
}