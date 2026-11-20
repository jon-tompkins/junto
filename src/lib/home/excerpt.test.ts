import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchExcerpt } from './excerpt';

test('dispatchExcerpt strips markdown and clips on a word', () => {
  const raw = '# Morning brief\n\n**BTC** is bid. See [the note](https://example.com) for more.\n\n' + 'alpha '.repeat(200);
  const out = dispatchExcerpt(raw, 80);
  assert.equal(out.includes('#'), false);
  assert.equal(out.includes('**'), false);
  assert.equal(out.includes('https://'), false);
  assert.match(out, /Morning brief/);
  assert.match(out, /the note/);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 81);
});
