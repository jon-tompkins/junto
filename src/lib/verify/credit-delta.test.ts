import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  creditDelta,
  creditDeltaMatches,
  parseNumericConst,
  resolveQuickDispatchBilledCredits,
} from './credit-delta';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('credit delta is balance before minus balance after', () => {
  assert.equal(creditDelta(1000, 995), 5);
  assert.equal(creditDelta(1000, 1000), 0);
  assert.equal(creditDelta(100, 105), -5);
});

test('credit delta matches only the exact billed amount', () => {
  assert.equal(creditDeltaMatches(1000, 995, 5), true);
  assert.equal(creditDeltaMatches(1000, 990, 5), false);
  assert.equal(creditDeltaMatches(1000, 1000, 0), true);
  assert.equal(creditDeltaMatches(40, 35, 5), true);
  assert.equal(creditDeltaMatches(40, 40, 5), false);
});

test('credit delta rejects non-finite inputs', () => {
  assert.throws(() => creditDelta(Number.NaN, 1), /finite/);
  assert.throws(() => creditDelta(1, Number.POSITIVE_INFINITY), /finite/);
  assert.throws(() => creditDeltaMatches(10, 5, Number.NaN), /billed/);
});

test('parseNumericConst reads const and export const', () => {
  const source = `
    const QUICK_DISPATCH_CREDIT_COST = 5;
    export const SUBSCRIBER_COST_PER_SEND = 5;
    export const OWNER_COST_PER_SEND = 10;
    const ignored = "5";
  `;
  assert.equal(parseNumericConst(source, 'QUICK_DISPATCH_CREDIT_COST'), 5);
  assert.equal(parseNumericConst(source, 'SUBSCRIBER_COST_PER_SEND'), 5);
  assert.equal(parseNumericConst(source, 'OWNER_COST_PER_SEND'), 10);
  assert.equal(parseNumericConst(source, 'MISSING'), null);
});

test('resolver requires the constant to be the deductCredits amount', () => {
  const pricingSource = 'export const SUBSCRIBER_COST_PER_SEND = 5;\nexport const OWNER_COST_PER_SEND = 10;\n';
  const creditsSource = 'export async function deductCredits() {}\n';
  assert.throws(
    () => resolveQuickDispatchBilledCredits({
      routeSource: 'const QUICK_DISPATCH_CREDIT_COST = 5;\n',
      pricingSource,
      creditsSource,
    }),
    /deductCredits/,
  );
});

test('live charge site is the amount passed to deductCredits and agrees with one per-send price', () => {
  const resolved = resolveQuickDispatchBilledCredits({
    routeSource: fs.readFileSync(path.join(root, 'src/app/api/quick-dispatch/route.ts'), 'utf8'),
    pricingSource: fs.readFileSync(path.join(root, 'src/lib/pricing.ts'), 'utf8'),
    creditsSource: fs.readFileSync(path.join(root, 'src/lib/db/credits.ts'), 'utf8'),
  });

  assert.equal(resolved.chargeConstant, 'QUICK_DISPATCH_CREDIT_COST');
  assert.equal(resolved.chargeFile, 'src/app/api/quick-dispatch/route.ts');
  assert.equal(Number.isInteger(resolved.billed), true);
  assert.ok(resolved.billed > 0);
  assert.equal(Object.keys(resolved.creditsModule).length, 0);
  const match = resolved.pricingMatch;
  assert.ok(match === 'SUBSCRIBER_COST_PER_SEND' || match === 'OWNER_COST_PER_SEND');
  if (match !== 'SUBSCRIBER_COST_PER_SEND' && match !== 'OWNER_COST_PER_SEND') return;
  assert.equal(resolved.pricing[match], resolved.billed);
  assert.equal(creditDeltaMatches(1_000, 1_000 - resolved.billed, resolved.billed), true);
  assert.equal(creditDeltaMatches(1_000, 1_000 - resolved.billed - 1, resolved.billed), false);
});
