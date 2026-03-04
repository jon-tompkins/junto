import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET /api/research/requests - list user's requests (or all if public)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const url = new URL(request.url);
    const all = url.searchParams.get('all') === 'true';
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const supabase = getSupabase();
    
    let query = supabase
      .from('research_requests')
      .select(`
        id,
        ticker,
        status,
        created_at,
        started_at,
        completed_at,
        report_id,
        user_id
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // If not requesting all and user is logged in, filter to their requests
    if (!all && session?.user) {
      const twitterHandle = (session.user as any).twitterHandle;
      
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('twitter_handle', twitterHandle)
        .single();

      if (user) {
        query = query.eq('user_id', user.id);
      }
    }

    const { data: requests, error } = await query;

    if (error) {
      console.error('Error fetching requests:', error);
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    // Enrich with user info
    const userIds = [...new Set(requests?.map(r => r.user_id) || [])];
    const { data: users } = await supabase
      .from('users')
      .select('id, twitter_handle, display_name')
      .in('id', userIds);

    const userMap = new Map(users?.map(u => [u.id, u]) || []);

    const enrichedRequests = requests?.map(r => ({
      ...r,
      requested_by: userMap.get(r.user_id)?.twitter_handle || null,
      requested_by_name: userMap.get(r.user_id)?.display_name || null
    })) || [];

    return NextResponse.json({ 
      requests: enrichedRequests,
      total: enrichedRequests.length
    });

  } catch (error) {
    console.error('Research requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
