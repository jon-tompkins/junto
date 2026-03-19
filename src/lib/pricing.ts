/**
 * Credit pricing model for Junto newsletters
 *
 * - 100 credits = $1.00
 * - New users get 1,000 free credits ($10 value)
 * - Newsletter cost = 2x estimated generation cost, rounded down to nearest credit
 * - Creator earns 70% of subscription credits
 * - Content pulling cost is negligible; cost scales with source count (more tokens)
 */

// Cost constants
export const CREDITS_PER_DOLLAR = 100;
export const NEW_USER_BONUS_CREDITS = 1000;
export const CREATOR_REVENUE_SHARE = 0.7;

// Estimated generation cost per run in dollars
// Base cost + per-source marginal cost (more sources = more input tokens)
const BASE_GENERATION_COST = 0.02; // ~$0.02 base for Grok-3-fast
const PER_SOURCE_COST = 0.003; // ~$0.003 per source (~500 tokens of tweet content)

/**
 * Estimate the dollar cost to generate one run of a newsletter
 */
export function estimateRunCostDollars(sourceCount: number): number {
  return BASE_GENERATION_COST + (sourceCount * PER_SOURCE_COST);
}

/**
 * Calculate credit cost per run (2x generation cost, rounded down)
 * Minimum 1 credit per run.
 */
export function calculateCreditCostPerRun(sourceCount: number): number {
  const dollarCost = estimateRunCostDollars(sourceCount);
  const credits = Math.floor(dollarCost * 2 * CREDITS_PER_DOLLAR);
  return Math.max(1, credits);
}

/**
 * Calculate credits per cadence period (for display)
 */
export function calculateCreditCostPerPeriod(
  creditCostPerRun: number,
  cadence: 'daily' | 'twice_daily' | 'weekly'
): { perWeek: number; perMonth: number; runsPerWeek: number } {
  const runsPerWeek =
    cadence === 'twice_daily' ? 14 :
    cadence === 'daily' ? 7 :
    1; // weekly

  return {
    perWeek: creditCostPerRun * runsPerWeek,
    perMonth: Math.round(creditCostPerRun * runsPerWeek * 4.33),
    runsPerWeek,
  };
}

/**
 * Format credits as estimated dollar cost (rounded to nearest cent)
 */
export function creditsToDollars(credits: number): string {
  const dollars = credits / CREDITS_PER_DOLLAR;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Cadence display labels
 */
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
