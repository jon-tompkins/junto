import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// GET /api/newsletters/available - List available newsletters (public, no auth required)
export async function GET() {
  try {
    const supabase = getSupabase();
    
    // Get all active newsletters
    const { data: newsletters, error } = await supabase
      .from('available_newsletters')
      .select('id, name, slug, description')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching newsletters:', error);
      return NextResponse.json({ error: 'Failed to fetch newsletters' }, { status: 500 });
    }

    return NextResponse.json({ newsletters: newsletters || [] });

  } catch (error) {
    console.error('Newsletters API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
