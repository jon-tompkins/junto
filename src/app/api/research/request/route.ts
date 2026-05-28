import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { deductCredits, addCredits } from '@/lib/db/credits';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CREDITS_PER_DEEPDIVE = 5;
const AILMANACK_BASE = process.env.AILMANACK_URL || 'https://www.ailmanack.com';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session.user?.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', session.user.twitterId).single();
    return data?.id || null;
  }
  if (session.user?.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', session.user.googleId).single();
    return data?.id || null;
  }
  return null;
}

// POST /api/research/request — kicks off an Ailmanack deep-dive on behalf of
// the signed-in junto user. Charges 5 junto credits on success; refunds them
// if the bridge call fails (Ailmanack-side processing failures are not
// refundable here — those need a webhook back).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = await resolveUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { ticker } = await req.json().catch(() => ({ ticker: null }));
  const clean = (ticker || '').toString().toUpperCase().trim();
  if (!/^[A-Z]{1,10}$/.test(clean)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  const secret = process.env.JUNTO_BRIDGE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Bridge not configured' }, { status: 500 });
  }

  const ok = await deductCredits(
    userId,
    CREDITS_PER_DEEPDIVE,
    'research',
    `Deep dive: ${clean}`,
  );
  if (!ok) {
    return NextResponse.json(
      { error: 'Insufficient credits', required: CREDITS_PER_DEEPDIVE },
      { status: 402 },
    );
  }

  try {
    const res = await fetch(`${AILMANACK_BASE}/api/public/research/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ ticker: clean }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      await addCredits(userId, CREDITS_PER_DEEPDIVE, 'refund', `Refund: ${clean} request failed`);
      return NextResponse.json(
        { error: body.error || 'Failed to queue report' },
        { status: res.status },
      );
    }
    return NextResponse.json({
      ok: true,
      status: body.status,
      request: body.request,
      message: body.status === 'already_pending'
        ? 'A report for this ticker is already being generated.'
        : 'Report queued — usually ready within 5 minutes.',
    });
  } catch (err: any) {
    await addCredits(userId, CREDITS_PER_DEEPDIVE, 'refund', `Refund: ${clean} bridge error`);
    console.error('[junto research/request]', err);
    return NextResponse.json({ error: 'Bridge unavailable, credits refunded' }, { status: 502 });
  }
}
