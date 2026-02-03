import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    
    // Get all users with their scheduling data
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .not('email', 'is', null);
    
    if (error) {
      throw error;
    }
    
    const currentTime = new Date();
    const debug = users?.map(user => {
      // Test the same logic as scheduling
      const userLocalNow = getCurrentTimeInTimezone(user.timezone || 'UTC');
      const userLocalDate = getCurrentDateInTimezone(user.timezone || 'UTC');
      const timeHasPassed = user.preferred_send_time ? 
        hasTimePassed(user.preferred_send_time, userLocalNow) : false;
      
      return {
        id: user.id,
        email: user.email,
        preferred_send_time: user.preferred_send_time,
        timezone: user.timezone,
        last_newsletter_sent: user.last_newsletter_sent,
        send_frequency: user.send_frequency,
        weekend_delivery: user.weekend_delivery,
        settings: user.settings,
        // Debug calculations
        currentTimeUTC: currentTime.toISOString(),
        userLocalTime: userLocalNow,
        userLocalDate: userLocalDate,
        timeHasPassed: timeHasPassed,
        wouldBeMatched: timeHasPassed && (!user.last_newsletter_sent || user.last_newsletter_sent < userLocalDate)
      };
    });
    
    return NextResponse.json({
      success: true,
      timestamp: currentTime.toISOString(),
      users: debug
    });
    
  } catch (error) {
    console.error('Debug scheduling error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

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