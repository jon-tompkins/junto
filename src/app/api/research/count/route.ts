import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// GET /api/research/count - lightweight flag endpoint
// Returns ONLY the count of pending requests (no data)
// Used for minimal heartbeat checks
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();

    // Just count, don't fetch full objects
    const { count, error } = await supabase
      .from('research_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) {
      console.error('Error counting pending requests:', error);
      return NextResponse.json({ error: 'Failed to count requests' }, { status: 500 });
    }

    return NextResponse.json({ 
      count: count || 0
    });

  } catch (error) {
    console.error('Count requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
