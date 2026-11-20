import test from 'node:test';
import assert from 'node:assert/strict';
import { postTweet } from './post';
import { composeTweet } from '../dispatch-x-crosspost';
import {
  AGENT_TWEET_MARKER,
  AGENT_TWEET_SUFFIX,
  X_TWEET_MAX_WEIGHTED,
  fitTweetText,
  isTweetLengthError,
  truncateTweetDraft,
  tweetBudget,
  xWeightedLength,
} from './text';

const CRED_KEYS = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] as const;

async function assertPostSurvivesLengthCheck(text: string): Promise<void> {
  const saved = CRED_KEYS.map((key) => process.env[key]);
  for (const key of CRED_KEYS) delete process.env[key];
  try {
    await assert.rejects(postTweet(text), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(
        err.message.includes('Tweet text must be 1–280'),
        false,
        `length guard rejected a fittable tweet: ${err.message}`,
      );
      assert.match(err.message, /X credentials not configured/);
      return true;
    });
  } finally {
    CRED_KEYS.forEach((key, index) => {
      const value = saved[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test('emoji weighs 2 and urls weigh 23', () => {
  assert.equal(xWeightedLength('a'), 1);
  assert.equal(xWeightedLength('🤖'), 2);
  assert.equal(xWeightedLength('👍🏽'), 2);
  assert.equal(xWeightedLength('🇺🇸'), 2);
  assert.equal(xWeightedLength('日'), 2);
  assert.equal(xWeightedLength('…'), 2);
  assert.equal(xWeightedLength(AGENT_TWEET_SUFFIX), 3);

  const url =
    'https://www.myjunto.xyz/newsletter/231f1b52-7b26-4401-b8ee-85421062a72d/01f445f0-243c-4bcf-8178-02629ebc7a5c';
  assert.ok(url.length > 23);
  assert.equal(xWeightedLength(url), 23);
  assert.equal(xWeightedLength(`See ${url}.`), xWeightedLength('See .') + 23);
});

test('at-limit: suffix fits exactly at 280 and is not truncated', async () => {
  const room = X_TWEET_MAX_WEIGHTED - xWeightedLength(AGENT_TWEET_SUFFIX);
  const text = 'a'.repeat(room);
  assert.equal(xWeightedLength(text + AGENT_TWEET_SUFFIX), X_TWEET_MAX_WEIGHTED);

  const fitted = fitTweetText(text);
  assert.equal(fitted, text + AGENT_TWEET_SUFFIX);
  assert.equal(fitted.includes('…'), false);
  assert.equal(xWeightedLength(fitted), X_TWEET_MAX_WEIGHTED);

  const budget = tweetBudget(text);
  assert.equal(budget.max, X_TWEET_MAX_WEIGHTED);
  assert.equal(budget.draftLimit, room);
  assert.equal(budget.used, X_TWEET_MAX_WEIGHTED);

  await assertPostSurvivesLengthCheck(text);
});

test('just-over: truncates on a word boundary with an ellipsis', async () => {
  let text = '';
  while (xWeightedLength(`${text}word`) <= X_TWEET_MAX_WEIGHTED) text += 'word ';
  text = `${text.trimEnd()} extra`;
  assert.ok(xWeightedLength(text) > X_TWEET_MAX_WEIGHTED);
  assert.ok(xWeightedLength(text) <= X_TWEET_MAX_WEIGHTED + ' extra'.length);

  const fitted = fitTweetText(text);
  assert.ok(xWeightedLength(fitted) <= X_TWEET_MAX_WEIGHTED);
  assert.ok(fitted.endsWith(`…${AGENT_TWEET_SUFFIX}`));
  const body = fitted.slice(0, -(`…${AGENT_TWEET_SUFFIX}`).length);
  assert.match(body, /^(?:word )*word$/);
  assert.equal(body.includes('extra'), false);
  assert.equal(body.endsWith('wor'), false);

  await assertPostSurvivesLengthCheck(text);
});

test('overflow-only-after-suffix: 280 alone still posts after the tag is reserved', async () => {
  const text = 'a'.repeat(X_TWEET_MAX_WEIGHTED);
  assert.equal(xWeightedLength(text), X_TWEET_MAX_WEIGHTED);
  assert.ok(xWeightedLength(text + AGENT_TWEET_SUFFIX) > X_TWEET_MAX_WEIGHTED);

  const fitted = fitTweetText(text);
  assert.ok(fitted.endsWith(AGENT_TWEET_SUFFIX));
  assert.ok(fitted.includes('…'));
  assert.ok(xWeightedLength(fitted) <= X_TWEET_MAX_WEIGHTED);
  assert.ok(fitted.length < text.length + AGENT_TWEET_SUFFIX.length);

  const draft = truncateTweetDraft(text);
  assert.equal(draft.includes(AGENT_TWEET_MARKER), false);
  assert.equal(fitTweetText(draft), fitted);

  await assertPostSurvivesLengthCheck(text);
});

test('empty text still fails the length guard', () => {
  assert.throws(
    () => fitTweetText('   '),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Tweet text must be 1–280 chars \(got 0\)/);
      assert.equal(isTweetLengthError(err.message), true);
      return true;
    },
  );
});

test('composeTweet uses the shared draft budget and keeps the permalink', () => {
  const permalink =
    'https://www.myjunto.xyz/newsletter/231f1b52-7b26-4401-b8ee-85421062a72d/01f445f0-243c-4bcf-8178-02629ebc7a5c';
  const tweet = composeTweet(`${'Markets are open and the tape is loud. '.repeat(30)}`, ['BTC', 'ETH', 'SOL'], permalink);
  const budget = tweetBudget(tweet);
  assert.ok(budget.used <= budget.max, `composed ${budget.used}/${budget.max}`);
  assert.ok(tweet.includes(permalink));
  assert.ok(tweet.includes('$BTC $ETH $SOL'));
  assert.ok(tweet.includes('…'));

  const posted = fitTweetText(tweet);
  assert.ok(posted.endsWith(AGENT_TWEET_SUFFIX));
  assert.ok(posted.includes(permalink));
  assert.ok(xWeightedLength(posted) <= X_TWEET_MAX_WEIGHTED);
});
