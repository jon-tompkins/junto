import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import {
  getLatestPersonalDispatch,
  listPersonalDispatches,
} from '@/lib/db/personal-dispatches';
import { hasProPrivileges, type Tier } from '@/lib/tiers';

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

// GET /api/v2/personal-dispatch — latest dispatch + history index
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: u } = await getSupabase()
    .from('users')
    .select('is_pro, subscription_tier, featured_junto_id')
    .eq('id', userId)
    .single();

  const tier = (u?.subscription_tier as Tier) || (u?.is_pro ? 'pro' : 'free');
  if (!hasProPrivileges(tier)) {
    return NextResponse.json({ error: 'Pro required', code: 'pro_required' }, { status: 402 });
  }

  let latest = null;
  let history: Awaited<ReturnType<typeof listPersonalDispatches>> = [];
  try {
    latest = await getLatestPersonalDispatch(userId);
    history = await listPersonalDispatches(userId, 14);
  } catch (err: any) {
    // 42P01 = relation does not exist — migration 038 not yet applied
    if (err?.code !== '42P01') throw err;
  }

  return NextResponse.json({
    latest,
    history: history.map((d) => ({
      id: d.id,
      dispatch_date: d.dispatch_date,
      subject: d.subject,
      source_count: d.source_count,
      ticker_count: d.ticker_count,
    })),
    has_featured_junto: !!u?.featured_junto_id,
  });
}
