import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

// Helper to find user by various identifiers
async function findUser(supabase: any, session: any) {
  const twitterHandle = (session.user as any).twitterHandle;
  const twitterId = (session.user as any).twitterId;
  const sessionEmail = session.user?.email;
  
  // Priority 1: Find by twitter_id (most reliable, set during OAuth)
  if (twitterId) {
    const { data: byTwitterId } = await supabase
      .from('users')
      .select('*')
      .eq('twitter_id', twitterId)
      .single();
    if (byTwitterId) return byTwitterId;
  }
  
  // Priority 2: Find by twitter_handle column
  if (twitterHandle) {
    const { data: byTwitterHandle } = await supabase
      .from('users')
      .select('*')
      .eq('twitter_handle', twitterHandle)
      .single();
    if (byTwitterHandle) return byTwitterHandle;
  }
  
  // Priority 3: Find by name (legacy - some users may have name=twitter_handle)
  if (twitterHandle) {
    const { data: byName } = await supabase
      .from('users')
      .select('*')
      .eq('name', twitterHandle)
      .single();
    if (byName) return byName;
  }
  
  // Priority 4: Find by email from session
  if (sessionEmail) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .eq('email', sessionEmail)
      .single();
    if (byEmail) return byEmail;
  }
  
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

    // Build update data - DON'T overwrite name if userId is provided (preserve existing user linkage)
    const updateData: Record<string, any> = {
      email: email || null,
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
      console.log('Updating user by explicit userId:', userId, 'data:', JSON.stringify(updateData));
      updateResult = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select();
      console.log('Update result:', JSON.stringify(updateResult));
    } else {
      // Try to find existing user
      const existingUser = await findUser(supabase, session);
      const twitterId = (session.user as any).twitterId;
      
      if (existingUser) {
        console.log('Found existing user by session lookup:', existingUser.id);
        // Also ensure twitter_handle and twitter_id are set on existing users
        const fullUpdateData = {
          ...updateData,
          twitter_handle: twitterHandle || existingUser.twitter_handle,
          twitter_id: twitterId || existingUser.twitter_id,
        };
        updateResult = await supabase
          .from('users')
          .update(fullUpdateData)
          .eq('id', existingUser.id)
          .select();
      } else {
        // Create new user if email is provided
        if (!email) {
          return NextResponse.json({ 
            error: 'Email is required for new users',
            needsEmail: true 
          }, { status: 400 });
        }
        
        // For new users, set both twitter_handle column AND name for compatibility
        updateResult = await supabase
          .from('users')
          .insert({
            ...updateData,
            name: twitterHandle,
            twitter_handle: twitterHandle,
            twitter_id: twitterId || null,
            has_access: true, // Grant access on signup
            created_at: new Date().toISOString(),
          })
          .select();
        console.log('Created new user with twitter handle:', twitterHandle, 'twitter_id:', twitterId);
      }
    }

    if (updateResult?.error) {
      console.error('Database update error:', updateResult.error);
      throw updateResult.error;
    }

    // Verify the update worked - prefer getting by ID from the result
    let verifyUser = updateResult?.data?.[0];
    if (!verifyUser) {
      // Fall back to findUser if result didn't include the user
      verifyUser = await findUser(supabase, session);
    }
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
