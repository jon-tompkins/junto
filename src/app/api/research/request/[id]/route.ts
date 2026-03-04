import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// GET /api/research/request/[id] - get request status (public for now)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: researchRequest, error } = await supabase
      .from('research_requests')
      .select(`
        id,
        ticker,
        status,
        created_at,
        started_at,
        completed_at,
        report_id,
        error_message,
        user_id
      `)
      .eq('id', id)
      .single();

    if (error || !researchRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Get requester info
    const { data: user } = await supabase
      .from('users')
      .select('twitter_handle, display_name')
      .eq('id', researchRequest.user_id)
      .single();

    return NextResponse.json({
      request: {
        id: researchRequest.id,
        ticker: researchRequest.ticker,
        status: researchRequest.status,
        created_at: researchRequest.created_at,
        started_at: researchRequest.started_at,
        completed_at: researchRequest.completed_at,
        report_id: researchRequest.report_id,
        error_message: researchRequest.error_message,
        requested_by: user?.twitter_handle || null,
        requested_by_name: user?.display_name || null
      }
    });

  } catch (error) {
    console.error('Research request status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
