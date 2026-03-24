import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCreditBalance, getUserEmail, setUserEmail } from '@/lib/db/credits';
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

// GET /api/v2/account — get account info (balance, email)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const supabase = getSupabase();
    const [balance, email] = await Promise.all([
      getCreditBalance(userId),
      getUserEmail(userId),
    ]);

    const { data: user } = await supabase.from('users').select('timezone').eq('id', userId).single();

    return NextResponse.json({ balance, email, userId, timezone: user?.timezone || 'America/New_York' });
  } catch (error) {
    console.error('[GET /account]', error);
    return NextResponse.json({ error: 'Failed to get account' }, { status: 500 });
  }
}

// PUT /api/v2/account — update account email
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();

    const supabase = getSupabase();

    if (body.email) {
      if (!body.email.includes('@') || !body.email.includes('.')) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      }
      await setUserEmail(userId, body.email);
    }

    if (body.timezone) {
      // Validate it's a real timezone
      try {
        Intl.DateTimeFormat(undefined, { timeZone: body.timezone });
        await supabase.from('users').update({ timezone: body.timezone }).eq('id', userId);
      } catch {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
      }
    }

    const [balance, email] = await Promise.all([
      getCreditBalance(userId),
      getUserEmail(userId),
    ]);

    const { data: user } = await supabase.from('users').select('timezone').eq('id', userId).single();

    return NextResponse.json({ balance, email, userId, timezone: user?.timezone || 'America/New_York' });
  } catch (error) {
    console.error('[PUT /account]', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}
