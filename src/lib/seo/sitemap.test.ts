import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSourcePages, buildTickerPages, buildDispatchPages } from './sitemap';

const B = 'https://www.myjunto.xyz';

test('source pages: case-insensitive dedupe, first casing wins', () => {
  const out = buildSourcePages(['Alice', 'alice', 'ALICE', 'Bob'], B);
  assert.deepEqual(out.map((e) => e.url), [`${B}/sources/Alice`, `${B}/sources/Bob`]);
});

test('source pages: drops null / undefined / empty', () => {
  assert.equal(buildSourcePages([null, undefined, '', 'x'], B).length, 1);
});

test('source pages: encodes handles', () => {
  assert.equal(buildSourcePages(['a b', '$BTC'], B).map((e) => e.url).join(','), `${B}/sources/a%20b,${B}/sources/%24BTC`);
});

test('empty input yields empty output', () => {
  assert.deepEqual(buildSourcePages([], B), []);
  assert.deepEqual(buildTickerPages([], B), []);
  assert.deepEqual(buildDispatchPages([], B), []);
});

test('ticker pages: unique + encoded, run without tickers ignored', () => {
  const out = buildTickerPages([{ tickers: ['AAPL', '$BTC'] }, { tickers: ['AAPL'] }, { tickers: null }, {}], B);
  assert.deepEqual(out.map((e) => e.url), [`${B}/tickers/AAPL`, `${B}/tickers/%24BTC`]);
});

test('dispatch pages: url shape and lastModified from generated_at', () => {
  const out = buildDispatchPages([
    { id: 'r1', newsletter_id: 'n1', generated_at: '2026-01-02T03:04:05Z' },
    { id: 'r2', newsletter_id: 'n1', generated_at: null },
  ], B);
  assert.equal(out[0].url, `${B}/newsletter/n1/r1`);
  assert.equal((out[0].lastModified as Date).toISOString(), '2026-01-02T03:04:05.000Z');
  assert.equal(out[1].url, `${B}/newsletter/n1/r2`);
  assert.ok(out[1].lastModified instanceof Date);
});
