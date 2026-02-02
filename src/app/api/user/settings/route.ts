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

    // Store delivery_time as-is in the user's preferred timezone
    // The scheduling API will handle timezone conversion at execution time
    let preferredSendTime = '09:00:00'; // Default
    if (delivery_time) {
      // Simply store the time as provided by frontend (HH:MM format) 
      // Convert to HH:MM:SS format
      preferredSendTime = delivery_time.includes(':') 
        ? (delivery_time.length === 5 ? delivery_time + ':00' : delivery_time)
        : '09:00:00';
    }

    const { error } = await supabase
      .from('users')
      .update({
        email: email || null,
        settings: otherSettings,
        preferred_send_time: preferredSendTime,
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
