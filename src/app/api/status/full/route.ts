import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/utils/config';

export async function GET(request: NextRequest) {
  const checks: Record<string, { status: 'ok' | 'missing' | 'error', detail?: string }> = {};
  
  // Environment variables
  checks['SUPABASE_URL'] = config.supabase.url ? { status: 'ok' } : { status: 'missing' };
  checks['SUPABASE_SERVICE_ROLE_KEY'] = config.supabase.serviceRoleKey ? { status: 'ok' } : { status: 'missing' };
  checks['ANTHROPIC_API_KEY'] = config.anthropic.apiKey ? { status: 'ok' } : { status: 'missing', detail: 'Newsletter AI generation disabled' };
  checks['RESEND_API_KEY'] = config.resend.apiKey ? { status: 'ok' } : { status: 'missing', detail: 'Email sending disabled' };
  checks['TWITTER_PROXY_URL'] = config.twitter.proxyUrl ? { status: 'ok' } : { status: 'missing', detail: 'Tweet fetching disabled' };
  checks['TWITTER_PROXY_TOKEN'] = config.twitter.proxyToken ? { status: 'ok' } : { status: 'missing', detail: 'Tweet fetching disabled' };
  
  // Database tables
  const tables = ['users', 'profiles', 'user_profiles', 'tweets', 'newsletters', 'scheduling_logs'];
  const tableResults: Record<string, { exists: boolean, count?: number, error?: string }> = {};
  
  for (const table of tables) {
    try {
      const response = await fetch(
        `${config.supabase.url}/rest/v1/${table}?select=id&limit=1`,
        {
          headers: {
            'apikey': config.supabase.serviceRoleKey || config.supabase.anonKey || '',
            'Authorization': `Bearer ${config.supabase.serviceRoleKey || config.supabase.anonKey || ''}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        // Get count
        const countResponse = await fetch(
          `${config.supabase.url}/rest/v1/${table}?select=id`,
          {
            headers: {
              'apikey': config.supabase.serviceRoleKey || config.supabase.anonKey || '',
              'Authorization': `Bearer ${config.supabase.serviceRoleKey || config.supabase.anonKey || ''}`,
              'Prefer': 'count=exact',
              'Range': '0-0',
            },
          }
        );
        const contentRange = countResponse.headers.get('content-range');
        const count = contentRange ? parseInt(contentRange.split('/')[1] || '0') : 0;
        
        tableResults[table] = { exists: true, count };
      } else {
        const error = await response.json();
        tableResults[table] = { exists: false, error: error.message };
      }
    } catch (error) {
      tableResults[table] = { exists: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  // Get users with scheduling configured
  let usersWithScheduling = 0;
  try {
    const response = await fetch(
      `${config.supabase.url}/rest/v1/users?select=id&email=not.is.null&preferred_send_time=not.is.null&timezone=not.is.null`,
      {
        headers: {
          'apikey': config.supabase.serviceRoleKey || config.supabase.anonKey || '',
          'Authorization': `Bearer ${config.supabase.serviceRoleKey || config.supabase.anonKey || ''}`,
          'Prefer': 'count=exact',
          'Range': '0-0',
        },
      }
    );
    const contentRange = response.headers.get('content-range');
    usersWithScheduling = contentRange ? parseInt(contentRange.split('/')[1] || '0') : 0;
  } catch (e) {
    // ignore
  }
  
  // Determine overall status
  const criticalMissing = [
    !config.supabase.url,
    !config.supabase.serviceRoleKey,
    !tableResults['users']?.exists,
    !tableResults['newsletters']?.exists,
  ].filter(Boolean).length;
  
  const warningMissing = [
    !config.anthropic.apiKey,
    !config.resend.apiKey,
    !config.twitter.proxyUrl,
    !tableResults['profiles']?.exists,
    !tableResults['user_profiles']?.exists,
    !tableResults['tweets']?.exists,
  ].filter(Boolean).length;
  
  const overallStatus = criticalMissing > 0 ? 'broken' : warningMissing > 0 ? 'degraded' : 'healthy';
  
  // Build action items
  const actionItems: string[] = [];
  
  if (!tableResults['profiles']?.exists) {
    actionItems.push('Run migration 001_add_tweet_tables.sql in Supabase SQL Editor');
  }
  if (!tableResults['user_profiles']?.exists) {
    actionItems.push('Run migration 001_add_tweet_tables.sql in Supabase SQL Editor (creates user_profiles)');
  }
  if (!tableResults['tweets']?.exists) {
    actionItems.push('Run migration 001_add_tweet_tables.sql in Supabase SQL Editor (creates tweets)');
  }
  if (!config.resend.apiKey) {
    actionItems.push('Set RESEND_API_KEY environment variable for email sending');
  }
  if (!config.anthropic.apiKey) {
    actionItems.push('Set ANTHROPIC_API_KEY environment variable for AI newsletter generation');
  }
  if (!config.twitter.proxyUrl || !config.twitter.proxyToken) {
    actionItems.push('Set TWITTER_PROXY_URL and TWITTER_PROXY_TOKEN for tweet fetching');
  }
  
  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    envChecks: checks,
    databaseTables: tableResults,
    usersWithScheduling,
    actionItems: actionItems.length > 0 ? actionItems : ['All systems operational'],
  });
}
