import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getSupabase } from '@/lib/db/client';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { profiles } = await request.json();
    
    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      return NextResponse.json({ error: 'No profiles provided' }, { status: 400 });
    }

    if (profiles.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 profiles allowed' }, { status: 400 });
    }

    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    const twitterId = (session.user as any).twitterId;
    
    // Get user from database - try multiple lookup strategies
    let user = null;
    
    // Priority 1: By twitter_id (most reliable)
    if (twitterId) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('twitter_id', twitterId)
        .single();
      if (data) user = data;
    }
    
    // Priority 2: By twitter_handle column
    if (!user && twitterHandle) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('twitter_handle', twitterHandle)
        .single();
      if (data) user = data;
    }
    
    // Priority 3: By name column (legacy)
    if (!user && twitterHandle) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('name', twitterHandle)
        .single();
      if (data) user = data;
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found. Please complete settings first.' }, { status: 404 });
    }

    // Ensure profiles exist in profiles table, create if not
    for (const handle of profiles) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('twitter_handle', handle)
        .single();

      if (!existingProfile) {
        await supabase
          .from('profiles')
          .insert({ twitter_handle: handle });
      }
    }

    // Get all profile IDs
    const { data: profileRecords, error: profileError } = await supabase
      .from('profiles')
      .select('id, twitter_handle')
      .in('twitter_handle', profiles);

    if (profileError) {
      throw profileError;
    }

    // Clear existing user_profiles
    await supabase
      .from('user_profiles')
      .delete()
      .eq('user_id', user.id);

    // Insert new user_profiles
    const userProfiles = profileRecords.map(profile => ({
      user_id: user.id,
      profile_id: profile.id,
    }));

    const { error: insertError } = await supabase
      .from('user_profiles')
      .insert(userProfiles);

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true, count: profiles.length });

  } catch (error) {
    console.error('Save profiles error:', error);
    return NextResponse.json({ error: 'Failed to save profiles' }, { status: 500 });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    const twitterId = (session.user as any).twitterId;
    
    // Get user's selected profiles - try multiple lookup strategies
    let user = null;
    
    // Priority 1: By twitter_id
    if (twitterId) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('twitter_id', twitterId)
        .single();
      if (data) user = data;
    }
    
    // Priority 2: By twitter_handle
    if (!user && twitterHandle) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('twitter_handle', twitterHandle)
        .single();
      if (data) user = data;
    }
    
    // Priority 3: By name (legacy)
    if (!user && twitterHandle) {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('name', twitterHandle)
        .single();
      if (data) user = data;
    }

    if (!user) {
      return NextResponse.json({ profiles: [] });
    }

    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('profiles(twitter_handle)')
      .eq('user_id', user.id);

    const profiles = userProfiles?.map((up: any) => up.profiles.twitter_handle) || [];

    return NextResponse.json({ profiles });

  } catch (error) {
    console.error('Get profiles error:', error);
    return NextResponse.json({ error: 'Failed to get profiles' }, { status: 500 });
  }
}
