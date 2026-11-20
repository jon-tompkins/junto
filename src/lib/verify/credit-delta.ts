/**
 * Pure credit-delta helpers for the end-to-end verifier.
 *
 * The amount a paid Quick Dispatch actually deducts is NOT a constant in
 * `src/lib/db/credits.ts`. That module only moves a caller-supplied amount
 * through the `deduct_credits` RPC. The charge site is
 * `QUICK_DISPATCH_CREDIT_COST` in `src/app/api/quick-dispatch/route.ts`,
 * passed straight into `deductCredits`. Per-send prices live in
 * `src/lib/pricing.ts`. The verifier reads those files so the expected drop
 * is never a literal in the script.
 */

export function creditDelta(balanceBefore: number, balanceAfter: number): number {
  if (!Number.isFinite(balanceBefore) || !Number.isFinite(balanceAfter)) {
    throw new Error('credit balances must be finite numbers');
  }
  return balanceBefore - balanceAfter;
}

export function creditDeltaMatches(balanceBefore: number, balanceAfter: number, billed: number): boolean {
  if (!Number.isFinite(billed)) {
    throw new Error('billed amount must be a finite number');
  }
  return creditDelta(balanceBefore, balanceAfter) === billed;
}

/** Pull `const NAME = <number>` or `export const NAME = <number>` out of source text. */
export function parseNumericConst(source: string, name: string): number | null {
  const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*;`);
  const match = source.match(re);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

const PRICING_CONSTS = [
  'CREDITS_PER_DOLLAR',
  'NEW_USER_BONUS_CREDITS',
  'OWNER_COST_PER_SEND',
  'SUBSCRIBER_COST_PER_SEND',
  'DISPATCH_SOURCE_CAP',
] as const;

/** Per-send prices a Quick Dispatch charge is allowed to agree with. */
const PER_SEND_CONSTS = ['SUBSCRIBER_COST_PER_SEND', 'OWNER_COST_PER_SEND'] as const;

export interface BilledQuickDispatchCost {
  /** Amount `deductCredits` is called with for a paid Quick Dispatch. */
  billed: number;
  chargeConstant: 'QUICK_DISPATCH_CREDIT_COST';
  chargeFile: 'src/app/api/quick-dispatch/route.ts';
  /** Numeric constants read from `src/lib/pricing.ts`. */
  pricing: Record<string, number>;
  /** Numeric `export const` values in `src/lib/db/credits.ts` (none today). */
  creditsModule: Record<string, number>;
  /**
   * The single per-send pricing constant equal to `billed`, or null when the
   * charge site does not match exactly one of them.
   */
  pricingMatch: (typeof PER_SEND_CONSTS)[number] | null;
}

export function resolveQuickDispatchBilledCredits(files: {
  routeSource: string;
  pricingSource: string;
  creditsSource: string;
}): BilledQuickDispatchCost {
  const billed = parseNumericConst(files.routeSource, 'QUICK_DISPATCH_CREDIT_COST');
  if (billed == null) {
    throw new Error('QUICK_DISPATCH_CREDIT_COST was not found in the quick-dispatch route');
  }
  if (!Number.isInteger(billed) || billed < 0) {
    throw new Error(`QUICK_DISPATCH_CREDIT_COST must be a non-negative integer, got ${billed}`);
  }

  // The constant has to be the value handed to deductCredits, not an unused alias.
  const passedToDeduct = /deductCredits\s*\(\s*[^,]+,\s*QUICK_DISPATCH_CREDIT_COST\s*,/;
  if (!passedToDeduct.test(files.routeSource)) {
    throw new Error('QUICK_DISPATCH_CREDIT_COST is not the amount passed to deductCredits');
  }

  const pricing: Record<string, number> = {};
  for (const name of PRICING_CONSTS) {
    const value = parseNumericConst(files.pricingSource, name);
    if (value != null) pricing[name] = value;
  }

  const creditsModule: Record<string, number> = {};
  const exported = /export\s+const\s+([A-Z0-9_]+)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g;
  for (const match of files.creditsSource.matchAll(exported)) {
    creditsModule[match[1]] = Number(match[2]);
  }

  const matches = PER_SEND_CONSTS.filter((name) => pricing[name] === billed);
  return {
    billed,
    chargeConstant: 'QUICK_DISPATCH_CREDIT_COST',
    chargeFile: 'src/app/api/quick-dispatch/route.ts',
    pricing,
    creditsModule,
    pricingMatch: matches.length === 1 ? matches[0] : null,
  };
}
