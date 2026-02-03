import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const currentTime = new Date();
  
  // Match updated check-scheduled: 60-minute catch-up window
  const windowStart = new Date(currentTime);
  windowStart.setMinutes(Math.floor(windowStart.getMinutes() / 5) * 5, 0, 0);
  windowStart.setTime(windowStart.getTime() - 60 * 60 * 1000); // Look back 60 minutes
  const windowEnd = new Date(currentTime);
  windowEnd.setMinutes(Math.ceil(windowEnd.getMinutes() / 5) * 5, 0, 0);
  
  // Exact same query as check-scheduled
  const { data: rawUsersData, error: usersError } = await supabase
    .from('users')
    .select('id, email, preferred_send_time, timezone, last_newsletter_sent, send_frequency, weekend_delivery')
    .not('email', 'is', null)
    .not('preferred_send_time', 'is', null)
    .not('timezone', 'is', null);
  
  // Analyze each user
  const analysis = [];
  const currentDate = currentTime.toISOString().split('T')[0];
  const currentDayOfWeek = currentTime.getDay();
  
  for (const user of rawUsersData || []) {
    const userAnalysis: any = {
      email: user.email,
      preferred_send_time: user.preferred_send_time,
      timezone: user.timezone,
      last_newsletter_sent: user.last_newsletter_sent,
      send_frequency: user.send_frequency,
      weekend_delivery: user.weekend_delivery,
      checks: {}
    };
    
    // Timezone conversion
    const offsets: Record<string, number> = {
      'America/Los_Angeles': -8 * 60,
      'America/Denver': -7 * 60,
      'America/Chicago': -6 * 60,
      'America/New_York': -5 * 60,
      'UTC': 0,
    };
    const timezoneOffset = offsets[user.timezone] || 0;
    
    // Check multiple days
    const candidateResults = [];
    for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
      const targetDate = new Date(currentTime.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dateStr = targetDate.toISOString().split('T')[0];
      
      const userDateTime = `${dateStr}T${user.preferred_send_time}`;
      const userLocalTime = new Date(userDateTime);
      const userUtcTime = new Date(userLocalTime.getTime() - timezoneOffset * 60000);
      
      const inWindow = userUtcTime >= windowStart && userUtcTime <= windowEnd;
      candidateResults.push({
        dayOffset,
        dateStr,
        userUtcTime: userUtcTime.toISOString(),
        inWindow
      });
    }
    userAnalysis.checks.timeWindow = candidateResults;
    userAnalysis.checks.anyTimeMatch = candidateResults.some(c => c.inWindow);
    
    // Frequency check
    let shouldSend = false;
    const sendFrequency = user.send_frequency || 'daily';
    const lastSent = user.last_newsletter_sent;
    
    if (!lastSent) {
      shouldSend = true;
    } else {
      const daysSinceLastSent = Math.floor((currentTime.getTime() - new Date(lastSent).getTime()) / (1000 * 60 * 60 * 24));
      switch (sendFrequency) {
        case 'daily':
          shouldSend = lastSent < currentDate;
          break;
        case 'weekly':
          shouldSend = daysSinceLastSent >= 7;
          break;
        default:
          shouldSend = lastSent < currentDate;
      }
    }
    userAnalysis.checks.frequency = { shouldSend, lastSent, currentDate };
    
    // Weekend check
    const weekendDelivery = user.weekend_delivery || false;
    const isWeekend = currentDayOfWeek === 0 || currentDayOfWeek === 6;
    const weekendOk = isWeekend ? weekendDelivery : true;
    userAnalysis.checks.weekend = { 
      dayOfWeek: currentDayOfWeek, 
      isWeekend, 
      weekendDelivery, 
      passes: weekendOk 
    };
    
    // Final result
    userAnalysis.wouldProcess = userAnalysis.checks.anyTimeMatch && shouldSend && weekendOk;
    
    analysis.push(userAnalysis);
  }
  
  return NextResponse.json({
    timestamp: currentTime.toISOString(),
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString()
    },
    usersFound: rawUsersData?.length || 0,
    usersError: usersError,
    analysis
  });
}
