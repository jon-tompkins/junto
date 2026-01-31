import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export const maxDuration = 300; // 5 minutes for cron job

// This endpoint is called by cron - no authentication required
export async function GET(request: NextRequest) {
  console.log('🕐 Starting scheduled newsletter check...');
  const startTime = Date.now();
  
  try {
    const supabase = getSupabase();
    
    // Test basic database connectivity first
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('Database connection error:', testError);
      return NextResponse.json({
        success: false,
        error: 'Database connection failed',
        details: testError.message,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }
    
    // Try to call the database function
    const { data: dueUsers, error: usersError } = await supabase
      .rpc('get_users_due_for_newsletter');
    
    if (usersError) {
      console.error('Database function error:', usersError);
      return NextResponse.json({
        success: false,
        error: 'Database migration required',
        details: usersError.message,
        message: 'Please run the database migration: supabase_scheduling_system.sql',
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }
    
    console.log(`📋 Found ${dueUsers?.length || 0} users due for newsletters`);
    
    // For now, just return a successful response showing the system is working
    const summary = {
      success: true,
      message: 'Scheduled newsletter endpoint is working',
      timestamp: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
      database_status: 'connected',
      migration_status: 'completed',
      stats: {
        users_checked: dueUsers?.length || 0,
        users_matched: dueUsers?.length || 0,
        newsletters_queued: 0,
        newsletters_sent: 0,
        errors_count: 0,
      },
      next_steps: [
        'Database migration completed successfully',
        'Scheduling functions are available',
        'Ready to process scheduled newsletters'
      ]
    };
    
    console.log('📊 Scheduling run complete:', summary);
    
    return NextResponse.json(summary);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Scheduled newsletter check failed:', errorMsg);
    
    // Log the error
    try {
      const supabase = getSupabase();
      await supabase
        .from('scheduling_logs')
        .insert({
          users_checked: 0,
          users_matched: 0,
          newsletters_queued: 0,
          newsletters_sent: 0,
          errors_count: 1,
          processing_time_ms: processingTime,
          details: {
            error: errorMsg,
            timestamp: new Date().toISOString(),
            run_type: 'scheduled_check',
          }
        });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMsg,
        timestamp: new Date().toISOString(),
        processing_time_ms: processingTime,
      },
      { status: 500 }
    );
  }
}

// Also support POST for testing
export async function POST(request: NextRequest) {
  return GET(request);
}