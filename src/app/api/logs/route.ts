import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// GET /api/logs - Get recent data pull logs
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const userId = searchParams.get('user_id');
  
  try {
    // Get recent newsletters with metadata (contains pull info)
    let query = supabase
      .from('newsletters')
      .select('id, created_at, sent_at, tweet_count, metadata, user_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data: newsletters, error: nlError } = await query;
    
    if (nlError) throw nlError;
    
    // Get recent profile fetch times
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('twitter_handle, last_fetched_at, tweet_count')
      .order('last_fetched_at', { ascending: false })
      .limit(20);
    
    if (profError) throw profError;
    
    // Format as log entries
    const logs = [];
    
    // Newsletter generation logs
    for (const nl of newsletters || []) {
      logs.push({
        type: 'newsletter_generated',
        timestamp: nl.created_at,
        details: {
          id: nl.id,
          tweet_count: nl.tweet_count,
          profiles: nl.metadata?.profiles || [],
          recent_tweets: nl.metadata?.recent_tweets || 0,
          context_tweets: nl.metadata?.context_tweets || 0,
          sent_at: nl.sent_at,
        }
      });
    }
    
    // Profile fetch logs
    for (const p of profiles || []) {
      if (p.last_fetched_at) {
        logs.push({
          type: 'profile_fetched',
          timestamp: p.last_fetched_at,
          details: {
            handle: p.twitter_handle,
            tweet_count: p.tweet_count,
          }
        });
      }
    }
    
    // Sort all logs by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return NextResponse.json({
      logs: logs.slice(0, limit),
      summary: {
        total_newsletters: newsletters?.length || 0,
        profiles_tracked: profiles?.length || 0,
        last_fetch: profiles?.[0]?.last_fetched_at || null,
      }
    });
    
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
