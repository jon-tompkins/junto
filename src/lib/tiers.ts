export type Tier = 'free' | 'pro' | 'operator';

export const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, operator: 2 };

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
