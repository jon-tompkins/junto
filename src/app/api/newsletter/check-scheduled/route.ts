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
  
  // Track missing config for reporting
  const missingConfig: string[] = [];
  
  try {
    // Validate Supabase (required for any operation)
    validateConfig('supabase');
    
    // Check optional configs - don't fail if missing, just track
    try {
      validateConfig('resend');
    } catch (e) {
      missingConfig.push('RESEND_API_KEY (email sending disabled)');
    }
    
    try {
      validateConfig('anthropic');
    } catch (e) {
      missingConfig.push('ANTHROPIC_API_KEY (AI generation disabled)');
    }
    
    if (missingConfig.length > 0) {
      console.warn('⚠️ Missing optional config:', missingConfig.join(', '));
    }
    
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
    
    // Get users due for newsletter
    // Per spec: "Looks for users with delivery times less than current time that have not had a newsletter delivered"
    // This means: find users where their preferred_send_time (in their timezone) has passed today,
    // AND they haven't received a newsletter yet today.
    
    console.log(`Checking for users due for newsletter at ${currentTime.toISOString()}`);
    
    // Query users directly
    const { data: rawUsersData, error: usersError } = await supabase
      .from('users')
      .select('id, email, preferred_send_time, timezone, last_newsletter_sent, send_frequency, weekend_delivery, twitter_handle, twitter_id, created_at, updated_at')
      .not('email', 'is', null)
      .not('preferred_send_time', 'is', null)
      .not('timezone', 'is', null);
    
    if (usersError) {
      throw new Error(`Database error fetching users: ${usersError.message}`);
    }
    
    console.log(`Found ${rawUsersData?.length || 0} users with scheduling preferences`);
    console.log('Raw user data:', JSON.stringify(rawUsersData, null, 2));
    
    // Filter users based on scheduling logic per spec
    const users: ScheduledUser[] = [];
    const debugInfo: any[] = [];
    
    for (const user of rawUsersData || []) {
      const userDebug: any = { email: user.email, checks: {} };
      
      try {
        // Skip if missing required fields
        if (!user.email || !user.preferred_send_time || !user.timezone) {
          userDebug.checks.requiredFields = 'SKIP: missing required fields';
          debugInfo.push(userDebug);
          continue;
        }
        
        // Get current time in user's timezone
        const userLocalNow = getCurrentTimeInTimezone(user.timezone);
        const userLocalDate = getCurrentDateInTimezone(user.timezone);
        
        userDebug.userLocalNow = userLocalNow;
        userDebug.userLocalDate = userLocalDate;
        userDebug.preferredTime = user.preferred_send_time;
        
        // Check if preferred time has passed in user's timezone
        const timeHasPassed = hasTimePassed(user.preferred_send_time, userLocalNow);
        userDebug.checks.timeHasPassed = timeHasPassed ? 'PASS' : 'SKIP: time not yet';
        
        if (!timeHasPassed) {
          debugInfo.push(userDebug);
          continue;
        }
        
        // Check weekend delivery preference
        const isWeekend = isWeekendInTimezone(user.timezone);
        const weekendDelivery = user.weekend_delivery || false;
        
        if (isWeekend && !weekendDelivery) {
          userDebug.checks.weekend = 'SKIP: weekend delivery disabled';
          debugInfo.push(userDebug);
          continue;
        }
        userDebug.checks.weekend = 'PASS';
        
        // Check if already sent today (in user's timezone)
        const lastSent = user.last_newsletter_sent;
        userDebug.lastSent = lastSent;
        
        // Normalize lastSent to YYYY-MM-DD format (handles legacy "Mon Feb 03 2026" format)
        const normalizedLastSent = lastSent ? normalizeDateToYYYYMMDD(lastSent) : null;
        userDebug.normalizedLastSent = normalizedLastSent;
        
        // Check frequency requirements
        const sendFrequency = user.send_frequency || 'daily';
        let shouldSend = false;
        
        if (!normalizedLastSent) {
          shouldSend = true; // Never sent before or invalid date
          userDebug.checks.frequency = 'PASS: never sent (or invalid date)';
        } else {
          // For daily: check if last sent date is before today (in user's timezone)
          switch (sendFrequency) {
            case 'daily':
              shouldSend = normalizedLastSent < userLocalDate;
              userDebug.checks.frequency = shouldSend 
                ? `PASS: last sent ${normalizedLastSent} < today ${userLocalDate}`
                : `SKIP: already sent today (${normalizedLastSent} >= ${userLocalDate})`;
              break;
            case 'weekly':
              const lastSentDate = new Date(normalizedLastSent + 'T00:00:00');
              const daysSinceLastSent = Math.floor((currentTime.getTime() - lastSentDate.getTime()) / (1000 * 60 * 60 * 24));
              shouldSend = daysSinceLastSent >= 7;
              userDebug.checks.frequency = shouldSend 
                ? `PASS: ${daysSinceLastSent} days since last sent`
                : `SKIP: only ${daysSinceLastSent} days since last sent (need 7)`;
              break;
            case 'bi-weekly':
              const lastSentDate2 = new Date(normalizedLastSent + 'T00:00:00');
              const daysSinceLastSent2 = Math.floor((currentTime.getTime() - lastSentDate2.getTime()) / (1000 * 60 * 60 * 24));
              shouldSend = daysSinceLastSent2 >= 14;
              userDebug.checks.frequency = shouldSend 
                ? `PASS: ${daysSinceLastSent2} days since last sent`
                : `SKIP: only ${daysSinceLastSent2} days since last sent (need 14)`;
              break;
            default:
              shouldSend = normalizedLastSent < userLocalDate;
              userDebug.checks.frequency = shouldSend ? 'PASS' : 'SKIP';
          }
        }
        
        if (!shouldSend) {
          debugInfo.push(userDebug);
          continue;
        }
        
        // User is due for newsletter!
        userDebug.result = 'DUE';
        debugInfo.push(userDebug);
        
        users.push({
          user_id: user.id,
          email: user.email,
          preferred_send_time: user.preferred_send_time,
          timezone: user.timezone,
          local_send_time: `${userLocalDate}T${user.preferred_send_time}`,
          last_newsletter_sent: lastSent,
          send_frequency: sendFrequency
        });
        
        console.log(`✨ User ${user.email} is DUE (${user.preferred_send_time} ${user.timezone}, current: ${userLocalNow})`);
        
      } catch (error) {
        console.warn(`Error processing user ${user.id}:`, error);
        userDebug.error = error instanceof Error ? error.message : 'Unknown error';
        debugInfo.push(userDebug);
      }
    }
    
    // Log debug info
    console.log('User scheduling debug:', JSON.stringify(debugInfo, null, 2));
    
    // Helper functions for timezone calculations
    function getCurrentTimeInTimezone(timezone: string): string {
      try {
        const now = new Date();
        return now.toLocaleTimeString('en-GB', { 
          timeZone: timezone, 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit',
          hour12: false 
        });
      } catch (e) {
        console.warn(`Invalid timezone ${timezone}, using UTC`);
        return new Date().toISOString().substr(11, 8);
      }
    }
    
    function getCurrentDateInTimezone(timezone: string): string {
      try {
        const now = new Date();
        // Format: YYYY-MM-DD
        const parts = now.toLocaleDateString('en-CA', { timeZone: timezone }).split('/');
        return parts[0]; // en-CA gives YYYY-MM-DD format
      } catch (e) {
        console.warn(`Invalid timezone ${timezone}, using UTC`);
        return new Date().toISOString().split('T')[0];
      }
    }
    
    function hasTimePassed(preferredTime: string, currentTime: string): boolean {
      const [prefH, prefM] = preferredTime.split(':').map(Number);
      const [curH, curM] = currentTime.split(':').map(Number);
      
      if (curH > prefH) return true;
      if (curH === prefH && curM >= prefM) return true;
      return false;
    }
    
    function isWeekendInTimezone(timezone: string): boolean {
      try {
        const now = new Date();
        const dayName = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
        return dayName === 'Sat' || dayName === 'Sun';
      } catch (e) {
        const day = new Date().getDay();
        return day === 0 || day === 6;
      }
    }
    
    // Normalize date strings to YYYY-MM-DD format
    // Handles legacy format "Mon Feb 03 2026" and new format "2026-02-03"
    function normalizeDateToYYYYMMDD(dateStr: string): string | null {
      if (!dateStr) return null;
      
      // Already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
      }
      
      // Try parsing as a date string (handles "Mon Feb 03 2026" etc)
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          console.warn(`Invalid date string: ${dateStr}`);
          return null;
        }
        // Format as YYYY-MM-DD
        return date.toISOString().split('T')[0];
      } catch (e) {
        console.warn(`Failed to parse date: ${dateStr}`, e);
        return null;
      }
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
          usersChecked: rawUsersData?.length || 0,
          usersMatched: 0,
          newslettersSent: 0,
          errors: 0,
          processingTimeMs: processingTime
        },
        debug: {
          rawUserCount: rawUsersData?.length || 0,
          filterResults: debugInfo
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
      missingConfig: missingConfig.length > 0 ? missingConfig : undefined,
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
    let profileHandles: string[] = [];
    
    try {
      const { data: userProfiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('profiles(twitter_handle)')
        .eq('user_id', user.user_id);
      
      if (profileError) {
        // If user_profiles table doesn't exist, log and use fallback
        console.warn(`user_profiles query failed: ${profileError.message}`);
        // Check if user has settings with source profiles
        const { data: userData } = await supabase
          .from('users')
          .select('settings')
          .eq('id', user.user_id)
          .single();
        
        if (userData?.settings?.profiles) {
          profileHandles = userData.settings.profiles;
        }
      } else {
        profileHandles = userProfiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
      }
    } catch (e) {
      console.warn('Error fetching user profiles, checking settings fallback');
      const { data: userData } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.user_id)
        .single();
      
      if (userData?.settings?.profiles) {
        profileHandles = userData.settings.profiles;
      }
    }
    
    if (profileHandles.length === 0) {
      return {
        success: false,
        userId: user.user_id,
        email: user.email,
        error: 'No profiles selected for user (check user_profiles table or user settings.profiles)'
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
      // Instead of failing, create a placeholder newsletter
      console.log(`No tweets found for ${user.email} - creating placeholder newsletter`);
      
      // Check if we should still send a placeholder
      const placeholderContent = `# Daily Brief - ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Hello ${user.email.split('@')[0]}!

Your newsletter delivery is working, but we couldn't find any recent tweets from your selected sources (${profileHandles.join(', ')}).

**This could mean:**
- The tweet database is still being set up
- Your selected accounts haven't posted recently
- Tweet fetching needs to be configured

We'll try again at your next scheduled delivery time.

---
*Delivered by MyJunto*`;

      const placeholderSubject = `Daily Brief - No Updates Today`;
      
      // Skip sending if no email service
      if (!config.resend.apiKey) {
        return {
          success: false,
          userId: user.user_id,
          email: user.email,
          error: 'No tweets found and RESEND_API_KEY not configured'
        };
      }
      
      // Otherwise fall through to send the placeholder
      // For now, return error to indicate no content
      return {
        success: false,
        userId: user.user_id,
        email: user.email,
        error: 'No tweets found for user profiles in time range (tweets table may not exist - run migrations)'
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
    
    // Update user's last newsletter sent date (YYYY-MM-DD format in user's timezone for comparison)
    const userLocalDateNow = new Date().toLocaleDateString('en-CA', { timeZone: user.timezone });
    await supabase
      .from('users')
      .update({
        last_newsletter_sent: userLocalDateNow,
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