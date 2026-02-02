import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { validateConfig } from '@/lib/utils/config';

export async function GET(request: NextRequest) {
  try {
    validateConfig('supabase');
    const supabase = getSupabase();
    
    // Get raw users data
    const { data: rawUsers, error: usersError } = await supabase
      .from('users')
      .select('*');
    
    // Try to get count 
    const { count, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    // Check if users table exists and what columns it has
    const { data: tableInfo, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'users')
      .eq('table_schema', 'public');
    
    return NextResponse.json({
      success: true,
      debug: {
        rawUsers: rawUsers,
        rawUsersError: usersError,
        count: count,
        countError: countError,
        tableColumns: tableInfo,
        tableError: tableError,
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