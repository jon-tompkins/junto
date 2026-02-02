import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getRecentTweetsGrouped, getTweetsForContext } from '@/lib/db/tweets';
import { storeNewsletter } from '@/lib/db/newsletters';
import { generateNewsletter, PROMPT_VERSION } from '@/lib/synthesis/generator';
import { sendNewsletter } from '@/lib/email/sender';
import { getDateRange } from '@/lib/utils/date';
import { config, validateConfig } from '@/lib/utils/config';

export const maxDuration = 300; // 5 minutes for cron job

interface ScheduledUser {
  user_id: string;
  email: string;
  preferred_send_time: string;
  timezone: string;
  local_send_time: string;
  last_newsletter_sent: string | null;
  send_frequency: string;
}

interface ProcessingResult {
  success: boolean;
  userId: string;
  email: string;
  error?: string;
  newsletterId?: string;
  emailId?: string;
}

export async function GET(request: NextRequest) {
  console.log('🕐 Starting scheduled newsletter check...');
  
  const startTime = Date.now();
  let logId: string | null = null;
  
  try {
    // Validate configuration
    validateConfig('supabase');
    validateConfig('resend');
    validateConfig('anthropic');
    
    const supabase = getSupabase();
    const currentTime = new Date();
    
    // Initialize processing log
    const { data: log } = await supabase
      .from('scheduling_logs')
      .insert({
        users_checked: 0,
        users_matched: 0,
        newsletters_queued: 0,
        newsletters_sent: 0,
        errors_count: 0,
        processing_time_ms: 0,
        details: { 
          start_time: currentTime.toISOString(),
          status: 'started'
        }
      })
      .select('id')
      .single();
    
    logId = log?.id;
    
    // Get users due for newsletter using direct database query
    // Calculate 5-minute window for scheduling flexibility
    const windowStart = new Date(currentTime);
    windowStart.setMinutes(Math.floor(windowStart.getMinutes() / 5) * 5, 0, 0); // Round down to nearest 5 minutes
    const windowEnd = new Date(windowStart.getTime() + 5 * 60 * 1000); // Add 5 minutes
    
    console.log(`Checking for users with send times between ${windowStart.toISOString()} and ${windowEnd.toISOString()}`);
    
    // Query users directly instead of using the missing database function
    const { data: rawUsersData, error: usersError } = await supabase
      .from('users')
      .select('id, email, preferred_send_time, timezone, last_newsletter_sent, send_frequency, weekend_delivery')
      .not('email', 'is', null)
      .not('preferred_send_time', 'is', null)
      .not('timezone', 'is', null);
    
    if (usersError) {
      throw new Error(`Database error fetching users: ${usersError.message}`);
    }
    
    // Filter users based on scheduling logic (replicate the database function logic)
    const users: ScheduledUser[] = [];
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentDayOfWeek = currentTime.getDay(); // 0 = Sunday, 6 = Saturday
    
    for (const user of rawUsersData || []) {
      try {
        // Skip if missing required fields
        if (!user.email || !user.preferred_send_time || !user.timezone) {
          continue;
        }
        
        // Convert user's preferred time to UTC
        const userDate = new Date().toISOString().split('T')[0]; // Today's date
        const userDateTime = `${userDate}T${user.preferred_send_time}`;
        const userLocal = new Date(userDateTime);
        
        // Create a date object in the user's timezone
        // Note: This is a simplified timezone conversion. For production, consider using a proper timezone library.
        const timezoneOffset = getTimezoneOffset(user.timezone);
        const userUtc = new Date(userLocal.getTime() - timezoneOffset * 60000);
        
        // Check if user's preferred time falls within the current 5-minute window
        const isInTimeWindow = userUtc >= windowStart && userUtc <= windowEnd;
        
        if (!isInTimeWindow) {
          continue;
        }
        
        // Check frequency requirements
        const sendFrequency = user.send_frequency || 'daily';
        const lastSent = user.last_newsletter_sent;
        
        let shouldSend = false;
        if (!lastSent) {
          shouldSend = true; // Never sent before
        } else {
          const lastSentDate = new Date(lastSent);
          const daysSinceLastSent = Math.floor((currentTime.getTime() - lastSentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          switch (sendFrequency) {
            case 'daily':
              shouldSend = lastSent < currentDate;
              break;
            case 'weekly':
              shouldSend = daysSinceLastSent >= 7;
              break;
            case 'bi-weekly':
              shouldSend = daysSinceLastSent >= 14;
              break;
            default:
              shouldSend = lastSent < currentDate; // Default to daily
          }
        }
        
        if (!shouldSend) {
          continue;
        }
        
        // Check weekend delivery preference
        const weekendDelivery = user.weekend_delivery || false;
        const isWeekend = currentDayOfWeek === 0 || currentDayOfWeek === 6;
        
        if (isWeekend && !weekendDelivery) {
          continue;
        }
        
        // Add user to the list
        users.push({
          user_id: user.id,
          email: user.email,
          preferred_send_time: user.preferred_send_time,
          timezone: user.timezone,
          local_send_time: userUtc.toISOString(),
          last_newsletter_sent: lastSent,
          send_frequency: sendFrequency
        });
        
      } catch (error) {
        console.warn(`Error processing user ${user.id}:`, error);
        // Continue with next user
      }
    }
    
    // Helper function for basic timezone offset (simplified)
    function getTimezoneOffset(timezone: string): number {
      const offsets: Record<string, number> = {
        'America/Los_Angeles': -8 * 60, // PST (simplified, doesn't account for DST)
        'America/Denver': -7 * 60, // MST
        'America/Chicago': -6 * 60, // CST
        'America/New_York': -5 * 60, // EST
        'UTC': 0,
        'Europe/London': 0, // GMT (simplified)
        'Europe/Paris': 1 * 60, // CET
        // Add more as needed
      };
      return offsets[timezone] || 0; // Default to UTC if unknown
    }
    console.log(`Found ${users.length} users due for newsletters`);
    
    if (users.length === 0) {
      const processingTime = Date.now() - startTime;
      
      // Update log
      if (logId) {
        await supabase
          .from('scheduling_logs')
          .update({
            users_checked: 0,
            users_matched: 0,
            newsletters_queued: 0,
            newsletters_sent: 0,
            errors_count: 0,
            processing_time_ms: processingTime,
            details: {
              start_time: currentTime.toISOString(),
              end_time: new Date().toISOString(),
              status: 'completed',
              message: 'No users due for newsletters'
            }
          })
          .eq('id', logId);
      }
      
      return NextResponse.json({
        success: true,
        message: 'No users due for newsletters',
        timestamp: currentTime.toISOString(),
        stats: {
          usersChecked: 0,
          usersMatched: 0,
          newslettersSent: 0,
          errors: 0,
          processingTimeMs: processingTime
        }
      });
    }
    
    // Process each user
    const results: ProcessingResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        console.log(`Processing user: ${user.email} (${user.timezone} ${user.preferred_send_time})`);
        
        const result = await processUserNewsletter(user, supabase);
        results.push(result);
        
        if (result.success) {
          successCount++;
          console.log(`✅ Successfully sent newsletter to ${user.email}`);
        } else {
          errorCount++;
          console.error(`❌ Failed to send newsletter to ${user.email}: ${result.error}`);
        }
        
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error processing ${user.email}:`, errorMessage);
        
        results.push({
          success: false,
          userId: user.user_id,
          email: user.email,
          error: errorMessage
        });
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // Update final log
    if (logId) {
      await supabase
        .from('scheduling_logs')
        .update({
          users_checked: users.length,
          users_matched: users.length,
          newsletters_queued: successCount,
          newsletters_sent: successCount,
          errors_count: errorCount,
          processing_time_ms: processingTime,
          details: {
            start_time: currentTime.toISOString(),
            end_time: new Date().toISOString(),
            status: 'completed',
            results: results.map(r => ({
              email: r.email,
              success: r.success,
              error: r.error,
              newsletterId: r.newsletterId,
              emailId: r.emailId
            }))
          }
        })
        .eq('id', logId);
    }
    
    console.log(`🏁 Completed scheduled newsletter check: ${successCount} sent, ${errorCount} errors`);
    
    return NextResponse.json({
      success: true,
      message: `Processed ${users.length} users: ${successCount} successful, ${errorCount} errors`,
      timestamp: currentTime.toISOString(),
      stats: {
        usersChecked: users.length,
        usersMatched: users.length,
        newslettersSent: successCount,
        errors: errorCount,
        processingTimeMs: processingTime
      },
      results: results
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Scheduled newsletter check failed:', errorMessage);
    
    // Update log with error
    if (logId) {
      try {
        await getSupabase()
          .from('scheduling_logs')
          .update({
            errors_count: 1,
            processing_time_ms: processingTime,
            details: {
              start_time: new Date(startTime).toISOString(),
              end_time: new Date().toISOString(),
              status: 'failed',
              error: errorMessage
            }
          })
          .eq('id', logId);
      } catch (logError) {
        console.error('Failed to update error log:', logError);
      }
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      stats: {
        usersChecked: 0,
        usersMatched: 0,
        newslettersSent: 0,
        errors: 1,
        processingTimeMs: processingTime
      }
    }, { status: 500 });
  }
}

async function processUserNewsletter(user: ScheduledUser, supabase: any): Promise<ProcessingResult> {
  try {
    // Get user's selected profiles
    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('profiles(twitter_handle)')
      .eq('user_id', user.user_id);
    
    const profileHandles = userProfiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
    
    if (profileHandles.length === 0) {
      return {
        success: false,
        userId: user.user_id,
        email: user.email,
        error: 'No profiles selected for user'
      };
    }
    
    // Get user settings
    const { data: userData } = await supabase
      .from('users')
      .select('settings, custom_prompt')
      .eq('id', user.user_id)
      .single();
    
    const settings = userData?.settings || {};
    const customPrompt = userData?.custom_prompt || null;
    const keywords = settings.keywords || [];
    
    // Generate newsletter content
    const recentHours = 48; // Default to last 48 hours
    const contextDays = 180; // Default context window
    
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
      return {
        success: false,
        userId: user.user_id,
        email: user.email,
        error: 'No tweets found for user profiles in time range'
      };
    }
    
    // Generate newsletter
    const synthesis = await generateNewsletter(
      recentTweets, 
      start, 
      end, 
      contextTweets,
      keywords,
      customPrompt
    );
    
    // Store newsletter in database
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
        scheduled_send: true,
        user_timezone: user.timezone,
        user_preferred_time: user.preferred_send_time
      },
    });
    
    // Send email
    const emailResult = await sendNewsletter({
      to: user.email,
      subject: synthesis.subject,
      content: synthesis.content,
      date: new Date().toISOString(),
    });
    
    // Update newsletter with sent status
    await supabase
      .from('newsletters')
      .update({
        sent_at: new Date().toISOString(),
        sent_to: [user.email],
      })
      .eq('id', newsletter.id);
    
    // Update user's last newsletter sent date
    await supabase
      .from('users')
      .update({
        last_newsletter_sent: new Date().toDateString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.user_id);
    
    return {
      success: true,
      userId: user.user_id,
      email: user.email,
      newsletterId: newsletter.id,
      emailId: emailResult.id
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    return {
      success: false,
      userId: user.user_id,
      email: user.email,
      error: errorMessage
    };
  }
}

// Also support POST for testing
export async function POST(request: NextRequest) {
  return GET(request);
}