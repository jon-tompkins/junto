import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_USER_BONUS_CREDITS } from '@/lib/pricing';
import { HOME_HEADLINE, homeSubhead, startFreeLabel } from './copy';

test('homepage headline is the owner-picked line', () => {
  assert.equal(
    HOME_HEADLINE,
    "Signal from noise: we track every caller's record so you don't have to.",
  );
  assert.doesNotMatch(HOME_HEADLINE, /smartest voices/i);
});

test('subhead binds the live tracked-account count and drops it when unknown', () => {
  assert.match(homeSubhead(1280), /tracks 1,280 crypto and market accounts/);
  assert.match(homeSubhead(1280), /one daily brief from the ones you pick/);
  assert.equal(
    homeSubhead(null),
    'MyJunto tracks crypto and market accounts, scores every call they make against the market, and sends you one daily brief from the ones you pick.',
  );
});

test('primary CTA reads the signup bonus from pricing', () => {
  assert.equal(NEW_USER_BONUS_CREDITS, 1000);
  assert.equal(startFreeLabel(), 'Start free · 1,000 credits');
});
