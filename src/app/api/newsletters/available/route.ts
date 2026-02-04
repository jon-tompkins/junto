import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

// GET /api/newsletters/available - List available newsletters
export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
