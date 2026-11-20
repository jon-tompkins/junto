import test from 'node:test';
import assert from 'node:assert/strict';
import { resetAlertDedupeForTests } from '@/lib/alerts';
import { TTS_MAX_INPUT_CHARS, chunkTextForTts, synthesizeChunkedSpeech, synthesizeSpeech } from './tts';

test('chunkTextForTts leaves short scripts as one piece', () => {
  assert.deepEqual(chunkTextForTts('hello'), ['hello']);
  assert.deepEqual(chunkTextForTts(''), []);
  const exact = 'a'.repeat(TTS_MAX_INPUT_CHARS);
  assert.deepEqual(chunkTextForTts(exact), [exact]);
});

test('chunkTextForTts splits above 4000 chars on word boundaries', () => {
  const word = 'alphaword';
  const text = Array.from({ length: 500 }, () => word).join(' ');
  assert.ok(text.length > TTS_MAX_INPUT_CHARS);

  const chunks = chunkTextForTts(text);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length > 0);
    assert.ok(chunk.length <= TTS_MAX_INPUT_CHARS);
    assert.match(chunk, /^(?:alphaword)(?: alphaword)*$/);
  }
  assert.deepEqual(chunks.join(' ').split(/\s+/), text.split(/\s+/));
});

test('chunkTextForTts hard-splits a single token longer than the cap', () => {
  const text = 'x'.repeat(TTS_MAX_INPUT_CHARS + 50);
  const chunks = chunkTextForTts(text);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks.join(''), text);
  for (const chunk of chunks) assert.ok(chunk.length <= TTS_MAX_INPUT_CHARS);
});

test('synthesizeSpeech rejects one input over the cap and pages once', async () => {
  const saved = process.env.OPENAI_API_KEY;
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.TELEGRAM_CHAT_ID;
  const savedFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.TELEGRAM_BOT_TOKEN = '123:test';
  process.env.TELEGRAM_CHAT_ID = '1';
  resetAlertDedupeForTests();
  let alertCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.match(String(input), /api\.telegram\.org/);
    alertCalls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => synthesizeSpeech({ text: 'a'.repeat(TTS_MAX_INPUT_CHARS + 1) }),
      /TTS input too long: 4001 > 4000/,
    );
    assert.equal(alertCalls, 1);
  } finally {
    globalThis.fetch = savedFetch;
    resetAlertDedupeForTests();
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = savedChat;
  }
});

test('synthesizeChunkedSpeech calls the API once per chunk under the cap', async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  const inputs: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { input: string };
    inputs.push(body.input);
    return new Response(Uint8Array.from([inputs.length]), { status: 200 });
  }) as typeof fetch;

  try {
    const text = `${'Sentence number one is long enough. '.repeat(200)}`;
    assert.ok(text.trim().length > TTS_MAX_INPUT_CHARS);
    const result = await synthesizeChunkedSpeech({ text, voice: 'onyx' });
    assert.ok(inputs.length >= 2);
    for (const input of inputs) assert.ok(input.length <= TTS_MAX_INPUT_CHARS);
    assert.equal(result.chars, inputs.reduce((sum, input) => sum + input.length, 0));
    assert.equal(result.audio.length, inputs.length);
    assert.deepEqual(
      inputs.join(' ').split(/\s+/),
      text.trim().split(/\s+/),
    );
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test('synthesizeSpeech retries 429 with bounded backoff then succeeds', async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) {
      return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
    }
    return new Response(Uint8Array.from([7, 8]), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await synthesizeSpeech({ text: 'hello' });
    assert.equal(calls, 3);
    assert.equal(result.chars, 5);
    assert.equal(result.audio.length, 2);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test('synthesizeSpeech stops after the bounded 429 retries', async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.TELEGRAM_CHAT_ID;
  const savedFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response('no', { status: 429, headers: { 'retry-after': '0' } });
  }) as typeof fetch;

  try {
    await assert.rejects(() => synthesizeSpeech({ text: 'hi' }), /OpenAI TTS failed: 429/);
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = savedChat;
  }
});

test('429 pages once, only after retries are exhausted', async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.TELEGRAM_CHAT_ID;
  const savedFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.TELEGRAM_BOT_TOKEN = '123:test';
  process.env.TELEGRAM_CHAT_ID = '1';
  resetAlertDedupeForTests();
  let ttsCalls = 0;
  let alertCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.telegram.org')) {
      alertCalls += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    ttsCalls += 1;
    return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
  }) as typeof fetch;

  try {
    await assert.rejects(() => synthesizeSpeech({ text: 'hi' }), /OpenAI TTS failed: 429/);
    assert.equal(ttsCalls, 4);
    assert.equal(alertCalls, 1);
  } finally {
    globalThis.fetch = savedFetch;
    resetAlertDedupeForTests();
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = savedChat;
  }
});

test('a 429 that recovers does not page', async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  const savedChat = process.env.TELEGRAM_CHAT_ID;
  const savedFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.TELEGRAM_BOT_TOKEN = '123:test';
  process.env.TELEGRAM_CHAT_ID = '1';
  resetAlertDedupeForTests();
  let ttsCalls = 0;
  let alertCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.telegram.org')) {
      alertCalls += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    ttsCalls += 1;
    if (ttsCalls < 3) return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
    return new Response(Uint8Array.from([1]), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await synthesizeSpeech({ text: 'hello' });
    assert.equal(result.chars, 5);
    assert.equal(ttsCalls, 3);
    assert.equal(alertCalls, 0);
  } finally {
    globalThis.fetch = savedFetch;
    resetAlertDedupeForTests();
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = savedToken;
    if (savedChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = savedChat;
  }
});

test('synthesizeSpeech does not retry a non-429 failure', async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response('bad', { status: 500 });
  }) as typeof fetch;

  try {
    await assert.rejects(() => synthesizeSpeech({ text: 'hi' }), /OpenAI TTS failed: 500/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});
