import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;
  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    return data?.id || null;
  }
  if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    return data?.id || null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50, 200);
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('id, amount, type, description, newsletter_id, run_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message, transactions: [] }, { status: 500 });
    }

    return NextResponse.json({ transactions: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
