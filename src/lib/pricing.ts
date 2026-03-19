/**
 * Credit pricing model for Junto newsletters
 *
 * - 100 credits = $1.00
 * - New users get 1,000 free credits ($10 value)
 *
 * TWO PRICING TIERS:
 * - Owner (admin): pays 2x estimated generation cost per run (covers infra + margin)
 * - Subscriber: pays 0.5x estimated generation cost per run
 *   Split: 50% to platform, 50% to newsletter creator
 *
 * - Content pulling cost is negligible; cost scales with source count (more tokens)
 * - Pricing is adjustable per-newsletter via admin_cost_multiplier / subscriber_cost_multiplier
 */

// ─── Constants ───────────────────────────────────────
export const CREDITS_PER_DOLLAR = 100;
export const NEW_USER_BONUS_CREDITS = 1000;

// Default multipliers (can be overridden per-newsletter)
export const DEFAULT_OWNER_COST_MULTIPLIER = 2.0;      // owner pays 2x gen cost
export const DEFAULT_SUBSCRIBER_COST_MULTIPLIER = 0.5;  // subscriber pays 0.5x gen cost
export const PLATFORM_SHARE = 0.5;  // platform gets 50% of subscriber credits
export const CREATOR_SHARE = 0.5;   // creator gets 50% of subscriber credits

// Estimated generation cost per run in dollars
const BASE_GENERATION_COST = 0.02;   // ~$0.02 base for Grok-3-fast
const PER_SOURCE_COST = 0.003;       // ~$0.003 per source (~500 tokens of tweet content)

// ─── Cost Estimation ─────────────────────────────────

/** Estimate the dollar cost to generate one run of a newsletter */
export function estimateRunCostDollars(sourceCount: number): number {
  return BASE_GENERATION_COST + (sourceCount * PER_SOURCE_COST);
}

/**
 * Calculate credit cost per run for the newsletter OWNER.
 * Default: 2x generation cost, rounded down. Min 1 credit.
 */
export function calculateOwnerCreditCost(
  sourceCount: number,
  multiplier: number = DEFAULT_OWNER_COST_MULTIPLIER,
): number {
  const dollarCost = estimateRunCostDollars(sourceCount);
  const credits = Math.floor(dollarCost * multiplier * CREDITS_PER_DOLLAR);
  return Math.max(1, credits);
}

/**
 * Calculate credit cost per run for a SUBSCRIBER.
 * Default: 0.5x generation cost, rounded down. Min 1 credit.
 */
export function calculateSubscriberCreditCost(
  sourceCount: number,
  multiplier: number = DEFAULT_SUBSCRIBER_COST_MULTIPLIER,
): number {
  const dollarCost = estimateRunCostDollars(sourceCount);
  const credits = Math.floor(dollarCost * multiplier * CREDITS_PER_DOLLAR);
  return Math.max(1, credits);
}

/**
 * Split subscriber payment into platform and creator shares.
 */
export function splitSubscriberPayment(creditCost: number): {
  platformCredits: number;
  creatorCredits: number;
} {
  const creatorCredits = Math.floor(creditCost * CREATOR_SHARE);
  const platformCredits = creditCost - creatorCredits; // platform gets remainder
  return { platformCredits, creatorCredits };
}

// ─── Period Calculations ─────────────────────────────

export function calculateCreditCostPerPeriod(
  creditCostPerRun: number,
  cadence: 'daily' | 'twice_daily' | 'weekly',
): { perWeek: number; perMonth: number; runsPerWeek: number } {
  const runsPerWeek =
    cadence === 'twice_daily' ? 14 :
    cadence === 'daily' ? 7 :
    1;

  return {
    perWeek: creditCostPerRun * runsPerWeek,
    perMonth: Math.round(creditCostPerRun * runsPerWeek * 4.33),
    runsPerWeek,
  };
}

// ─── Display Helpers ─────────────────────────────────

export function creditsToDollars(credits: number): string {
  const dollars = credits / CREDITS_PER_DOLLAR;
  return `$${dollars.toFixed(2)}`;
}

export const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2x Daily',
  weekly: 'Weekly',
};

export const CADENCE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'twice_daily', label: '2x Daily', description: 'Morning & evening' },
  { value: 'daily', label: 'Daily', description: 'Once per day' },
  { value: 'weekly', label: 'Weekly', description: 'Weekly digest' },
];
