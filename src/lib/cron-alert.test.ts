import test from 'node:test';
import assert from 'node:assert/strict';
import { resetAlertDedupeForTests } from './alerts';
import { withCronAlert } from './cron-alert';

const ORIGINAL_FETCH = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  resetAlertDedupeForTests();
});

function telegramOk(): void {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '42';
  resetAlertDedupeForTests();
}

test('withCronAlert pages on 5xx and on throw, and ignores 401', async () => {
  telegramOk();
  const seen: Array<{ status?: number; reason?: string }> = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
    const statusLine = body.text?.split('\n').find((line) => line.startsWith('status: '));
    const reasonLine = body.text?.split('\n').find((line) => line.startsWith('reason: '));
    seen.push({
      status: statusLine ? Number(statusLine.slice('status: '.length)) : undefined,
      reason: reasonLine?.slice('reason: '.length),
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const unauthorized = withCronAlert('/api/cron/pull-content', async () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 }),
  );
  const res401 = await unauthorized(undefined);
  assert.equal(res401.status, 401);
  assert.equal(seen.length, 0);

  const failing = withCronAlert('/api/cron/pull-content', async () =>
    Response.json({ error: 'Cron not configured' }, { status: 500 }),
  );
  const res500 = await failing(undefined);
  assert.equal(res500.status, 500);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].status, 500);
  assert.match(seen[0].reason ?? '', /Cron not configured/);

  const throwing = withCronAlert('/api/cron/collect-twitter', async () => {
    throw new Error('collect exploded');
  });
  await assert.rejects(() => throwing(undefined), /collect exploded/);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].status, 500);
  assert.match(seen[1].reason ?? '', /collect exploded/);
});
