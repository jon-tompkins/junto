import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// POST /api/research/process - update request status (internal use)
// Called by Jai to mark requests as processing/completed
export async function POST(request: NextRequest) {
  try {
    // Simple auth check - require secret header
    const authHeader = request.headers.get('x-process-secret');
    if (authHeader !== process.env.RESEARCH_PROCESS_SECRET && authHeader !== 'junto-research-2026') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId, status, reportId, errorMessage } = await request.json();

    if (!requestId || !status) {
      return NextResponse.json({ error: 'requestId and status required' }, { status: 400 });
    }

    if (!['pending', 'processing', 'completed', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = getSupabase();

    const updateData: Record<string, any> = { status };
    
    if (status === 'processing') {
      updateData.started_at = new Date().toISOString();
    }
    
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
      if (reportId) updateData.report_id = reportId;
    }
    
    if (status === 'failed' && errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { data, error } = await supabase
      .from('research_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      console.error('Error updating request:', error);
      return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      request: data
    });

  } catch (error) {
    console.error('Process request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/research/process - get pending requests (for Jai to poll)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-process-secret');
    if (authHeader !== process.env.RESEARCH_PROCESS_SECRET && authHeader !== 'junto-research-2026') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();

    const { data: requests, error } = await supabase
      .from('research_requests')
      .select(`
        id,
        ticker,
        status,
        created_at,
        user_id
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Error fetching pending requests:', error);
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    return NextResponse.json({ 
      pending: requests || [],
      count: requests?.length || 0
    });

  } catch (error) {
    console.error('Get pending requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
