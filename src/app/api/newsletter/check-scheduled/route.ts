import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // 5 minutes for cron job

// Simple test endpoint - called by cron
export async function GET(request: NextRequest) {
  console.log('🕐 Scheduled newsletter check - basic test');
  
  return NextResponse.json({
    success: true,
    message: 'Scheduled newsletter endpoint is working!',
    timestamp: new Date().toISOString(),
    status: 'ready',
    note: 'Database migration pending - run supabase_scheduling_system.sql'
  });
}

// Also support POST for testing
export async function POST(request: NextRequest) {
  return GET(request);
}