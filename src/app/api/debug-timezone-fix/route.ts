import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { validateConfig } from '@/lib/utils/config';

export async function GET(request: NextRequest) {
  try {
    validateConfig('supabase');
    const supabase = getSupabase();
    
    const currentTime = new Date();
    
    // Calculate 5-minute window
    const windowStart = new Date(currentTime);
    windowStart.setMinutes(Math.floor(windowStart.getMinutes() / 5) * 5, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + 5 * 60 * 1000);
    
    // Get user 2
    const { data: user } = await supabase
      .from('users')
      .select('id, email, preferred_send_time, timezone')
      .eq('email', 'jonto2121@gmail.com')
      .single();
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' });
    }
    
    // FIXED timezone conversion logic
    const userTimeStr = user.preferred_send_time; // "17:37:00"
    const userTimezone = user.timezone; // "America/Los_Angeles"
    
    // Create a proper date in the user's timezone
    // We need to find what UTC time corresponds to their local time TODAY
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // "2026-02-03"
    
    // Create date in user's local time using Intl API
    const userLocalDate = new Date(`${todayStr}T${userTimeStr}`);
    
    // Get timezone offset for PT (-8 hours = -480 minutes)
    const offsetMinutes = -8 * 60; // Simplified for PT
    
    // Convert to UTC by ADDING the offset (PT is behind UTC)
    const userUtcTime = new Date(userLocalDate.getTime() - offsetMinutes * 60000);
    
    // BUT - if this puts us in the past, check tomorrow too
    let candidateTimes = [userUtcTime];
    
    // If user time is in evening PT, it might convert to tomorrow UTC
    // Add tomorrow's candidate
    const tomorrowLocal = new Date(userLocalDate.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowUtc = new Date(tomorrowLocal.getTime() - offsetMinutes * 60000);
    candidateTimes.push(tomorrowUtc);
    
    // Check which candidate falls in current window
    let matchingTime = null;
    for (const candidateTime of candidateTimes) {
      if (candidateTime >= windowStart && candidateTime <= windowEnd) {
        matchingTime = candidateTime;
        break;
      }
    }
    
    return NextResponse.json({
      debug: {
        user: {
          email: user.email,
          preferred_send_time: user.preferred_send_time,
          timezone: user.timezone
        },
        window: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
          current: currentTime.toISOString()
        },
        conversion: {
          userLocalString: `${todayStr}T${userTimeStr}`,
          userLocalDate: userLocalDate.toISOString(),
          offsetMinutes: offsetMinutes,
          candidateTimes: candidateTimes.map(t => t.toISOString()),
          matchingTime: matchingTime?.toISOString() || null
        },
        result: {
          wouldMatch: !!matchingTime,
          reason: matchingTime ? 'Time falls in current window' : 'No candidate time matches window'
        }
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}