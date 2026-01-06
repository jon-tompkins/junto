import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    
    // For now, return all newsletters (later we can filter by user)
    const { data: newsletters, error } = await supabase
      .from('newsletters')
      .select('id, subject, content, generated_at, tweet_count')
      .order('generated_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({ newsletters: newsletters || [] });

  } catch (error) {
    console.error('Fetch newsletters error:', error);
    return NextResponse.json({ error: 'Failed to fetch newsletters' }, { status: 500 });
  }
}
