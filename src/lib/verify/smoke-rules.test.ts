import test from 'node:test';
import assert from 'node:assert/strict';
import { flagSlowLoad, healthTweetCapWarning, HEALTH_TWEET_ROW_CAP, DEFAULT_LEADERBOARD_BUDGET_MS } from './smoke-rules';

test('health tweet cap warning fires only on the exact row cap', () => {
  assert.equal(healthTweetCapWarning(999), null);
  assert.equal(healthTweetCapWarning(1001), null);
  assert.equal(healthTweetCapWarning(0), null);
  const warning = healthTweetCapWarning(HEALTH_TWEET_ROW_CAP);
  assert.ok(warning);
  assert.match(warning, /exactly 1000/);
  assert.match(warning, /capped/);
});

test('leaderboard load flag is warn-only unless asked to fail', () => {
  assert.equal(DEFAULT_LEADERBOARD_BUDGET_MS, 3000);
  assert.equal(flagSlowLoad(2900, 3000, 'warn'), 'pass');
  assert.equal(flagSlowLoad(3000, 3000, 'warn'), 'pass');
  assert.equal(flagSlowLoad(7000, 3000, 'warn'), 'warn');
  assert.equal(flagSlowLoad(7000, 3000, 'fail'), 'fail');
  assert.throws(() => flagSlowLoad(-1, 3000, 'warn'), /loadMs/);
  assert.throws(() => flagSlowLoad(10, 0, 'warn'), /budgetMs/);
});
