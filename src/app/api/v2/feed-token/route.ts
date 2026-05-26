import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { randomBytes } from 'crypto';

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

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

// GET — returns existing token, minting one if not set.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const supabase = getSupabase();
  const { data } = await supabase.from('users').select('feed_token').eq('id', userId).single();

  let token = data?.feed_token;
  if (!token) {
    token = newToken();
    await supabase.from('users').update({ feed_token: token }).eq('id', userId);
  }
  return NextResponse.json({ token });
}

// POST — rotate token.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const token = newToken();
  const supabase = getSupabase();
  await supabase.from('users').update({ feed_token: token }).eq('id', userId);
  return NextResponse.json({ token });
}
