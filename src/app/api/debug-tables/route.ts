import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { validateConfig } from '@/lib/utils/config';

export async function GET(request: NextRequest) {
  try {
    validateConfig('supabase');
    const supabase = getSupabase();
    
    // Try to get profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    // Try to get user_profiles 
    const { data: userProfiles, error: userProfilesError } = await supabase
      .from('user_profiles')
      .select('*');
    
    return NextResponse.json({
      success: true,
      debug: {
        profiles: {
          data: profiles,
          error: profilesError,
          count: profiles?.length || 0
        },
        userProfiles: {
          data: userProfiles,
          error: userProfilesError,
          count: userProfiles?.length || 0
        },
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}