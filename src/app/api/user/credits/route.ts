import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET /api/user/credits - get user's credit balance
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const twitterHandle = (session.user as any).twitterHandle;
    const supabase = getSupabase();

    const { data: user, error } = await supabase
      .from('users')
      .select('credits')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      credits: user.credits ?? 0 
    });

  } catch (error) {
    console.error('Credits fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
