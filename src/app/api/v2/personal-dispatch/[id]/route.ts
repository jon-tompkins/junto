import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session?.user?.twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_id', session.user.twitterId)
      .single();
    return data?.id || null;
  }
  if (session?.user?.googleId) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('google_id', session.user.googleId)
      .single();
    return data?.id || null;
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { id } = await params;

  const { data, error } = await getSupabase()
    .from('personal_dispatches')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ dispatch: data });
}
