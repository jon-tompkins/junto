import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createApiKey, listApiKeys } from '@/lib/db/api-keys';

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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const keys = await listApiKeys(userId);
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
      revoked: !!k.revoked_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = (body?.name || '').toString().trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { key, plaintext } = await createApiKey(userId, name);
  return NextResponse.json({
    id: key.id,
    name: key.name,
    key_prefix: key.key_prefix,
    created_at: key.created_at,
    plaintext, // returned ONCE — never readable again
  });
}
