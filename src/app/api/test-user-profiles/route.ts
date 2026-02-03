import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { validateConfig } from '@/lib/utils/config';

export async function GET(request: NextRequest) {
  try {
    validateConfig('supabase');
    const supabase = getSupabase();
    
    const user1Id = "8a456f2a-113c-4243-8714-e35c190a1d82"; // jon.tomp@gmail.com
    const user2Id = "d88438d6-e3d9-458f-a56d-e28ba82b1b0f"; // jonto2121@gmail.com
    
    // Test the exact query used by the newsletter processing
    const { data: user1Profiles, error: user1Error } = await supabase
      .from('user_profiles')
      .select('profiles(twitter_handle)')
      .eq('user_id', user1Id);
    
    const { data: user2Profiles, error: user2Error } = await supabase
      .from('user_profiles')
      .select('profiles(twitter_handle)')
      .eq('user_id', user2Id);
    
    const user1Handles = user1Profiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
    const user2Handles = user2Profiles?.map((p: any) => p.profiles?.twitter_handle).filter(Boolean) || [];
    
    return NextResponse.json({
      success: true,
      debug: {
        user1: {
          profiles: user1Profiles,
          error: user1Error,
          handles: user1Handles,
          count: user1Handles.length
        },
        user2: {
          profiles: user2Profiles, 
          error: user2Error,
          handles: user2Handles,
          count: user2Handles.length
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