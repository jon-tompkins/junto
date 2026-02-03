import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

// Helper to find user by various identifiers
async function findUser(supabase: any, session: any) {
  const twitterHandle = (session.user as any).twitterHandle;
  const twitterId = (session.user as any).twitterId;
  const sessionEmail = session.user?.email;
  
  // Try to find by name (which might match twitter handle) - this is the most reliable for existing users
  if (twitterHandle) {
    const { data: byName } = await supabase
      .from('users')
      .select('*')
      .eq('name', twitterHandle)
      .single();
    if (byName) return byName;
  }
  
  // Try to find by email from session
  if (sessionEmail) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .eq('email', sessionEmail)
      .single();
    if (byEmail) return byEmail;
  }
  
  // Fall back to finding any user with matching id format if we have twitterId
  // (In case the id column stores Twitter IDs)
  
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const user = await findUser(supabase, session);

    if (!user) {
      // Return empty settings for new users
      return NextResponse.json({ settings: null });
    }

    // Merge email into settings for convenience
    const settings = {
      ...(user.settings || {}),
      email: user.email || user.settings?.email || '',
      delivery_time: user.preferred_send_time ? user.preferred_send_time.substring(0, 5) : '09:00',
      timezone: user.timezone || 'America/Los_Angeles',
      frequency: user.send_frequency || 'daily',
      weekend_delivery: user.weekend_delivery || false,
    };

    return NextResponse.json({ settings, userId: user.id });

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
    const { settings, userId } = await request.json();
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;

    // Extract fields from settings
    const { email, delivery_time, timezone, frequency, weekend_delivery, ...otherSettings } = settings;

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

    const updateData = {
      email: email || null,
      name: twitterHandle, // Store twitter handle in name field for future lookups
      settings: otherSettings,
      preferred_send_time: preferredSendTime,
      timezone: timezone || 'America/Los_Angeles',
      send_frequency: frequency || 'daily',
      weekend_delivery: weekend_delivery || false,
      updated_at: new Date().toISOString(),
    };

    let updateResult;
    
    // If we have a userId passed from frontend, use that (most reliable)
    if (userId) {
      updateResult = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);
    } else {
      // Try to find existing user
      const existingUser = await findUser(supabase, session);
      
      if (existingUser) {
        updateResult = await supabase
          .from('users')
          .update(updateData)
          .eq('id', existingUser.id);
      } else {
        // Create new user if email is provided
        if (!email) {
          return NextResponse.json({ 
            error: 'Email is required for new users',
            needsEmail: true 
          }, { status: 400 });
        }
        
        updateResult = await supabase
          .from('users')
          .insert({
            ...updateData,
            created_at: new Date().toISOString(),
          });
      }
    }

    if (updateResult?.error) {
      console.error('Database update error:', updateResult.error);
      throw updateResult.error;
    }

    // Verify the update worked by re-fetching
    const verifyUser = await findUser(supabase, session);
    console.log('Settings saved for user:', verifyUser?.id, 'preferred_send_time:', verifyUser?.preferred_send_time, 'timezone:', verifyUser?.timezone);

    return NextResponse.json({ 
      success: true,
      userId: verifyUser?.id,
      savedSettings: {
        preferred_send_time: verifyUser?.preferred_send_time,
        timezone: verifyUser?.timezone,
        send_frequency: verifyUser?.send_frequency,
      }
    });

  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
