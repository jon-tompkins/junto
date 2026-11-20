import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertDedupeWindowMs,
  formatAlertMessage,
  httpStatusFromText,
  resetAlertDedupeForTests,
  sendAlert,
} from './alerts';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chat: process.env.TELEGRAM_CHAT_ID,
  window: process.env.ALERT_DEDUPE_WINDOW_MS,
};

function restoreEnv(): void {
  if (ORIGINAL_ENV.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_ENV.token;
  if (ORIGINAL_ENV.chat === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = ORIGINAL_ENV.chat;
  if (ORIGINAL_ENV.window === undefined) delete process.env.ALERT_DEDUPE_WINDOW_MS;
  else process.env.ALERT_DEDUPE_WINDOW_MS = ORIGINAL_ENV.window;
}

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv();
  resetAlertDedupeForTests();
});

test('formatAlertMessage includes route, status, reason, and an ET timestamp', () => {
  // 2026-11-12 3:07pm ET is the start of the Apify 401 outage (20:07 UTC, EST).
  const text = formatAlertMessage(
    {
      key: 'apify:start',
      route: '/api/cron/pull-content',
      status: 401,
      reason: 'Failed to start Apify run (HTTP 401: Unauthorized)',
    },
    new Date('2026-11-12T20:07:00.000Z'),
  );
  assert.match(text, /route: \/api\/cron\/pull-content/);
  assert.match(text, /status: 401/);
  assert.match(text, /reason: Failed to start Apify run \(HTTP 401: Unauthorized\)/);
  assert.match(text, /time: Nov 12, 2026 3:07 PM ET/);
  assert.match(text, /key: apify:start/);
});

test('formatAlertMessage collapses whitespace and caps a long reason', () => {
  const text = formatAlertMessage(
    {
      key: 'x:post',
      route: '/api/admin/x/post',
      status: 'error',
      reason: `too\n\nlong ${'x'.repeat(500)}`,
    },
    new Date('2026-08-18T15:00:00.000Z'),
  );
  const reason = text.split('\n').find((line) => line.startsWith('reason: ')) ?? '';
  assert.equal(reason.includes('\n'), false);
  assert.ok(reason.length < 420);
  assert.match(text, /status: error/);
});

test('sendAlert warns and does not fetch when Telegram env is missing', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  resetAlertDedupeForTests();
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched += 1;
    return new Response('{}', { status: 200 });
  };
  const warnings: unknown[][] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const first = await sendAlert({
      key: 'apify:start',
      route: '/api/cron/pull-content',
      status: 401,
      reason: 'Unauthorized',
    });
    const second = await sendAlert({
      key: 'apify:start',
      route: '/api/cron/pull-content',
      status: 401,
      reason: 'Unauthorized',
    });
    assert.deepEqual(first, { sent: false, skipped: 'unconfigured' });
    assert.deepEqual(second, { sent: false, skipped: 'unconfigured' });
    assert.equal(fetched, 0);
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing/);
  } finally {
    console.warn = orig;
  }
});

test('sendAlert dedupes the same key inside the window and sends again after it', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '-100123';
  delete process.env.ALERT_DEDUPE_WINDOW_MS;
  resetAlertDedupeForTests();

  const bodies: string[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(String(init?.body ?? ''));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  };

  const base = {
    key: 'x:post:too-long',
    route: '/api/admin/x/post',
    status: 'error' as const,
    reason: 'Tweet text must be 1–280 chars (got 400)',
    windowMs: 60 * 60 * 1000,
  };
  const t0 = new Date('2026-08-18T16:00:00.000Z');
  const first = await sendAlert({ ...base, now: t0 });
  const second = await sendAlert({ ...base, now: new Date(t0.getTime() + 30 * 60 * 1000) });
  const third = await sendAlert({ ...base, now: new Date(t0.getTime() + 60 * 60 * 1000) });

  assert.deepEqual(first, { sent: true });
  assert.deepEqual(second, { sent: false, skipped: 'deduped' });
  assert.deepEqual(third, { sent: true });
  assert.equal(bodies.length, 2);
  const payload = JSON.parse(bodies[0]) as { chat_id: string; text: string };
  assert.equal(payload.chat_id, '-100123');
  assert.match(payload.text, /route: \/api\/admin\/x\/post/);
  assert.match(payload.text, /status: error/);
  assert.match(payload.text, /1–280/);
  assert.match(payload.text, /ET/);
});

test('a different alert key is not suppressed by an open window', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '1';
  resetAlertDedupeForTests();
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const now = new Date('2026-11-12T20:07:00.000Z');
  await sendAlert({ key: 'apify:start', route: '/api/cron/pull-content', status: 401, reason: 'Unauthorized', now });
  await sendAlert({ key: 'apify:collect', route: '/api/cron/collect-twitter', status: 401, reason: 'Apify HTTP 401', now });
  assert.equal(fetched, 2);
});

test('sendAlert never throws when Telegram errors, and the window still holds', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '1';
  resetAlertDedupeForTests();
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched += 1;
    throw new Error('network down bot123:secret');
  };
  const now = new Date('2026-11-13T20:16:00.000Z');
  const result = await sendAlert({
    key: 'tts:429',
    route: 'src/lib/audio/tts.ts',
    status: 429,
    reason: 'OpenAI TTS failed: 429',
    now,
  });
  assert.deepEqual(result, { sent: false, skipped: 'error' });
  const again = await sendAlert({
    key: 'tts:429',
    route: 'src/lib/audio/tts.ts',
    status: 429,
    reason: 'OpenAI TTS failed: 429',
    now: new Date(now.getTime() + 1000),
  });
  assert.deepEqual(again, { sent: false, skipped: 'deduped' });
  assert.equal(fetched, 1);
});

test('httpStatusFromText reads vendor codes and ignores the 280-char limit', () => {
  assert.equal(httpStatusFromText('X POST /2/tweets 403: {"title":"Forbidden"}'), 403);
  assert.equal(httpStatusFromText('Failed to start Apify run (HTTP 401: Unauthorized)'), 401);
  assert.equal(httpStatusFromText('OpenAI TTS failed: 429 slow down'), 429);
  assert.equal(httpStatusFromText('Tweet text must be 1–280 chars (got 401)'), 'error');
});

test('alertDedupeWindowMs falls back to 1h and honors a positive env override', () => {
  delete process.env.ALERT_DEDUPE_WINDOW_MS;
  assert.equal(alertDedupeWindowMs(), 60 * 60 * 1000);
  assert.equal(alertDedupeWindowMs(5000), 5000);
  process.env.ALERT_DEDUPE_WINDOW_MS = '0';
  assert.equal(alertDedupeWindowMs(), 60 * 60 * 1000);
  process.env.ALERT_DEDUPE_WINDOW_MS = '120000';
  assert.equal(alertDedupeWindowMs(), 120000);
});
