import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { isAdminSession } from '@/lib/admin';
import { canAccessTrading, type Tier } from '@/lib/tiers';

export type TradingAccess = {
  userId: string;
  tier: Tier;
  isAdmin: boolean;
};

// Resolves the current viewer for any trading endpoint. Returns null when the
// caller doesn't have trading access (signed out, free/pro user, etc).
// Admins are treated as operators and can see any user's data — callers that
// scope by mandate should still honor `isAdmin` to widen the filter.
export async function getTradingAccess(): Promise<TradingAccess | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const supabase = getSupabase();
  const twitterId = (session.user as any).twitterId;
  const googleId = (session.user as any).googleId;

  let userRow: { id: string; subscription_tier: string | null; is_pro: boolean | null } | null = null;
  if (twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id, subscription_tier, is_pro')
      .eq('twitter_id', twitterId)
      .single();
    userRow = data || null;
  } else if (googleId) {
    const { data } = await supabase
      .from('users')
      .select('id, subscription_tier, is_pro')
      .eq('google_id', googleId)
      .single();
    userRow = data || null;
  }
  if (!userRow) return null;

  const tier = (userRow.subscription_tier as Tier) || (userRow.is_pro ? 'pro' : 'free');
  const isAdmin = await isAdminSession();
  if (!isAdmin && !canAccessTrading(tier)) return null;

  return { userId: userRow.id, tier, isAdmin };
}

// True if the caller can act on the given trade (owns its mandate, or admin).
export async function canAccessTrade(tradeId: string, access: TradingAccess): Promise<boolean> {
  if (access.isAdmin) return true;
  const supabase = getSupabase();
  const { data: trade } = await supabase
    .from('trades')
    .select('mandate_id')
    .eq('id', tradeId)
    .single();
  if (!trade) return false;
  const { data: mandate } = await supabase
    .from('trading_mandates')
    .select('user_id')
    .eq('id', trade.mandate_id)
    .single();
  return mandate?.user_id === access.userId;
}

// Returns the mandate row if it exists AND the caller can access it
// (owner or admin). Returns null otherwise.
export async function getAccessibleMandate(mandateId: string, access: TradingAccess): Promise<any | null> {
  const supabase = getSupabase();
  const { data: mandate } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('id', mandateId)
    .single();
  if (!mandate) return null;
  if (!access.isAdmin && mandate.user_id !== access.userId) return null;
  return mandate;
}
