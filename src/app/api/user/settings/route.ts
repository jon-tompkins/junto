import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    
    const { data: user } = await supabase
      .from('users')
      .select('settings, email')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (!user) {
      return NextResponse.json({ settings: null });
    }

    // Merge email into settings for convenience
    const settings = {
      ...(user.settings || {}),
      email: user.email || user.settings?.email || '',
    };

    return NextResponse.json({ settings });

  } catch (error) {
    console.error('Fetch settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { settings } = await request.json();
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;

    // Extract email to store in dedicated column
    const { email, delivery_time, timezone, ...otherSettings } = settings;

    // Convert local delivery time to UTC
    let utcTime = '09:00:00'; // Default
    if (delivery_time && timezone) {
      try {
        // Create a date with the user's local time
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const localDateTime = `${today}T${delivery_time}:00`;
        
        // Parse as local time in user's timezone
        const localDate = new Date(localDateTime + (timezone === 'UTC' ? 'Z' : ''));
        
        if (timezone !== 'UTC') {
          // Convert timezone offset
          const tempDate = new Date(`${today}T${delivery_time}:00`);
          const utcDate = new Date(tempDate.toLocaleString('en-US', {timeZone: 'UTC'}));
          const localDateInUserTz = new Date(tempDate.toLocaleString('en-US', {timeZone: timezone}));
          const offsetMs = utcDate.getTime() - localDateInUserTz.getTime();
          
          // Apply offset to get UTC time
          const utcDateTime = new Date(tempDate.getTime() + offsetMs);
          utcTime = utcDateTime.toTimeString().split(' ')[0]; // HH:MM:SS
        } else {
          utcTime = delivery_time + ':00';
        }
      } catch (error) {
        console.error('Timezone conversion error:', error);
        // Keep default time if conversion fails
      }
    }

    const { error } = await supabase
      .from('users')
      .update({
        email: email || null,
        settings: otherSettings,
        preferred_send_time: utcTime,
        timezone: timezone || 'UTC',
        send_frequency: settings.frequency || 'daily',
        updated_at: new Date().toISOString(),
      })
      .eq('twitter_handle', twitterHandle);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
