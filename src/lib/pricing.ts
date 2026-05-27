/**
 * Credit pricing model for Junto newsletters
 *
 * - 100 credits = $1.00
 * - New users get 1,000 free credits ($10 value)
 *
 * OWNER: flat rate per send based on source count tier
 * SUBSCRIBER: flat 2 credits per send, split 50/50 platform/creator
 *
 * Source tiers:
 *   1-10 sources:  10 credits/send ($0.10)
 *   11-20 sources: 15 credits/send ($0.15)
 *   21-30 sources: 20 credits/send ($0.20)
 *   31+ sources:   25 credits/send ($0.25)
 *
 * Future: YouTube/podcast transcripts add to source count and may
 * have their own premium tier.
 */

// ─── Constants ───────────────────────────────────────
export const CREDITS_PER_DOLLAR = 100;
export const NEW_USER_BONUS_CREDITS = 1000;

export const SUBSCRIBER_COST_PER_SEND = 2;  // 2 credits ($0.02) per delivery
export const PLATFORM_SHARE = 0.5;  // platform gets 50% of subscriber credits
export const CREATOR_SHARE = 0.5;   // creator gets 50% of subscriber credits

// ─── Source Tiers ────────────────────────────────────

const OWNER_COST_TIERS = [
  { maxSources: 10, credits: 10 },
  { maxSources: 20, credits: 15 },
  { maxSources: 30, credits: 20 },
  { maxSources: Infinity, credits: 25 },
];

// ─── Cost Calculation ────────────────────────────────

/**
 * Calculate credit cost per send for the newsletter OWNER.
 * Based on source count tier.
 */
export function calculateOwnerCreditCost(sourceCount: number, audioEnabled = false): number {
  let credits = OWNER_COST_TIERS[OWNER_COST_TIERS.length - 1].credits;
  for (const tier of OWNER_COST_TIERS) {
    if (sourceCount <= tier.maxSources) {
      credits = tier.credits;
      break;
    }
  }
  return audioEnabled ? credits * 2 : credits;
}

/**
 * Calculate credit cost per delivery for a SUBSCRIBER.
 * Flat rate; doubles when subscriber opted into audio delivery.
 */
export function calculateSubscriberCreditCost(audioEnabled = false): number {
  return audioEnabled ? SUBSCRIBER_COST_PER_SEND * 2 : SUBSCRIBER_COST_PER_SEND;
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

// ─── Display Helpers ─────────────────────────────────

/** Get the owner cost tier label for a source count */
export function getOwnerTierLabel(sourceCount: number, audioEnabled = false): string {
  const cost = calculateOwnerCreditCost(sourceCount, audioEnabled);
  return `${cost} credits/send ($${(cost / CREDITS_PER_DOLLAR).toFixed(2)})`;
}

/** Get subscriber cost label */
export function getSubscriberCostLabel(audioEnabled = false): string {
  const cost = calculateSubscriberCreditCost(audioEnabled);
  return `${cost} credits/send ($${(cost / CREDITS_PER_DOLLAR).toFixed(2)})`;
}

export function creditsToDollars(credits: number): string {
  const dollars = credits / CREDITS_PER_DOLLAR;
  return `$${dollars.toFixed(2)}`;
}

/** Estimate dollar cost to generate one run (for internal use) */
export function estimateRunCostDollars(sourceCount: number): number {
  return calculateOwnerCreditCost(sourceCount) / CREDITS_PER_DOLLAR;
}

// ─── Period Calculations ─────────────────────────────

export function calculateCreditCostPerPeriod(
  creditCostPerRun: number,
  sendsPerWeek: number,
): { perWeek: number; perMonth: number } {
  return {
    perWeek: creditCostPerRun * sendsPerWeek,
    perMonth: Math.round(creditCostPerRun * sendsPerWeek * 4.33),
  };
}

// ─── Labels ──────────────────────────────────────────

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
