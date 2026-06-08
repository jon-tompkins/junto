import { getSupabase } from '@/lib/db/client';

export type Tier = 'free' | 'pro' | 'operator';

export const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, operator: 2 };

export const TIER_LABELS: Record<Tier, string> = {
  free: 'Free',
  pro: 'Pro',
  operator: 'Operator',
};

// Monthly Stripe-fulfilled credit grant per tier.
export const TIER_MONTHLY_CREDITS: Record<Exclude<Tier, 'free'>, number> = {
  pro: 500,
  operator: 2000,
};

// One canonical place that says "this tier or higher unlocks trading".
export function canAccessTrading(tier: Tier | null | undefined): boolean {
  return !!tier && TIER_RANK[tier] >= TIER_RANK.operator;
}

export function hasProPrivileges(tier: Tier | null | undefined): boolean {
  return !!tier && TIER_RANK[tier] >= TIER_RANK.pro;
}

// Resolve a user's tier. Falls back to is_pro for safety while we transition.
export async function getUserTier(userId: string): Promise<Tier> {
  const { data } = await getSupabase()
    .from('users')
    .select('subscription_tier, is_pro')
    .eq('id', userId)
    .single();
  if (!data) return 'free';
  const t = (data.subscription_tier as Tier) || (data.is_pro ? 'pro' : 'free');
  return (['free', 'pro', 'operator'] as Tier[]).includes(t) ? t : 'free';
}

// Map a Stripe price ID back to the tier + interval it represents. Returns null
// for unknown price IDs (e.g. one-time credit packs). Use this in the webhook to
// decide which tier to grant on checkout.
export function tierForPriceId(priceId: string): { tier: Exclude<Tier, 'free'>; interval: 'month' | 'year' } | null {
  if (priceId === process.env.STRIPE_OPERATOR_PRICE_ID) return { tier: 'operator', interval: 'month' };
  if (priceId === process.env.STRIPE_OPERATOR_ANNUAL_PRICE_ID) return { tier: 'operator', interval: 'year' };
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return { tier: 'pro', interval: 'month' };
  if (priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) return { tier: 'pro', interval: 'year' };
  return null;
}
