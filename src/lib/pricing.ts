/**
 * Credit pricing model for Junto newsletters
 *
 * - 100 credits = $1.00
 * - New users get 1,000 free credits ($10 value)
 *
 * Pricing is FLAT (decided 2026-06-23): the per-source cost lives upstream in
 * shared source tracking (tweet pull + analyst-profile refresh, amortized
 * across every newsletter that references a source), NOT in the dispatch
 * render — which is a single near-flat LLM call. So source count is not billed;
 * instead dispatches are hard-capped at DISPATCH_SOURCE_CAP sources to bound
 * upstream cost.
 *
 * OWNER: flat 10 credits/send ($0.10), regardless of source count.
 * SUBSCRIBER: flat 5 credits/send ($0.05), split 50/50 platform/creator.
 * Audio (TTS) carries real marginal cost, so it doubles either side.
 */

// ─── Constants ───────────────────────────────────────
export const CREDITS_PER_DOLLAR = 100;
export const NEW_USER_BONUS_CREDITS = 1000;

export const OWNER_COST_PER_SEND = 10;       // 10 credits ($0.10) per dispatch, flat
export const SUBSCRIBER_COST_PER_SEND = 5;   // 5 credits ($0.05) per delivery
export const PLATFORM_SHARE = 0.5;  // platform gets 50% of subscriber credits
export const CREATOR_SHARE = 0.5;   // creator gets 50% of subscriber credits

// Hard cap on sources per dispatch. The render barely scales with source
// count, but each tracked source carries upstream per-day cost (tweet pull +
// profile refresh), so we bound it. Also enforced at the junto level
// (junto_sources is capped at 20).
export const DISPATCH_SOURCE_CAP = 20;

// ─── Cost Calculation ────────────────────────────────

/**
 * Calculate credit cost per send for the newsletter OWNER.
 * Flat rate; doubles when the dispatch generates audio.
 * (sourceCount accepted for signature stability but no longer billed.)
 */
export function calculateOwnerCreditCost(_sourceCount: number, audioEnabled = false): number {
  return audioEnabled ? OWNER_COST_PER_SEND * 2 : OWNER_COST_PER_SEND;
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
