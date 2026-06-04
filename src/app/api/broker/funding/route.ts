import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createAchRelationshipStub } from '@/lib/trading/broker';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const twitterId = (session.user as any).twitterId;
  const googleId = (session.user as any).googleId;
  const { data: user } = await supabase
    .from('users')
    .select('id, alpaca_account_id')
    .or(twitterId ? `twitter_id.eq.${twitterId}` : `google_id.eq.${googleId}`)
    .single();
  if (!user?.alpaca_account_id) {
    return NextResponse.json({ error: 'Open a brokerage account first' }, { status: 400 });
  }

  // Stub: returns next-step instructions until Plaid Link is wired.
  const next = await createAchRelationshipStub(user.alpaca_account_id);
  return NextResponse.json(next);
}
