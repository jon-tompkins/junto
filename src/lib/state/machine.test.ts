import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, TRADE, MANDATE, checkTransition, canTransition, isTerminal, nextStates, defineMachine } from './index';

test('every registered machine is internally consistent', () => {
  for (const m of ALL) {
    for (const s of m.states) assert.ok(s in m.transitions, `${m.name}:${s}`);
    for (const t of m.terminal) assert.equal((m.transitions as any)[t].length, 0);
    // every non-initial state must be reachable from initial or terminal-entry
    const seen = new Set<string>([m.initial, ...(m.entries ?? [])]); const q = [...seen];
    while (q.length) for (const n of (m.transitions as any)[q.pop()!]) if (!seen.has(n)) { seen.add(n); q.push(n); }
    for (const s of m.states) assert.ok(seen.has(s), `${m.name}: "${s}" unreachable from "${m.initial}"`);
  }
});

test('trade lifecycle', () => {
  assert.ok(canTransition(TRADE, 'pending', 'submitted'));
  assert.ok(canTransition(TRADE, 'submitted', 'open'));
  assert.ok(canTransition(TRADE, 'open', 'closed'));
  assert.ok(canTransition(TRADE, 'open', 'open'), 'idempotent rewrite');
  assert.ok(!canTransition(TRADE, 'closed', 'open'));
  assert.ok(!canTransition(TRADE, 'pending', 'open'), 'must pass through submitted');
  assert.ok(isTerminal(TRADE, 'rejected'));
  assert.deepEqual(nextStates(TRADE, 'open'), ['closed']);
  assert.equal(checkTransition(TRADE, undefined, 'pending').ok, true);
  assert.equal(checkTransition(TRADE, undefined, 'open').ok, false);
});

test('mandate pause/resume', () => {
  assert.ok(canTransition(MANDATE, 'active', 'paused'));
  assert.ok(canTransition(MANDATE, 'paused', 'active'));
  assert.ok(!canTransition(MANDATE, 'archived', 'active'));
});

test('defineMachine rejects bad specs', () => {
  assert.throws(() => defineMachine({ name: 'x', storage: 'x', states: ['a', 'b'], initial: 'a', terminal: [], transitions: { a: ['c' as any], b: [] } }));
  assert.throws(() => defineMachine({ name: 'x', storage: 'x', states: ['a'], initial: 'a', terminal: ['a'], transitions: { a: ['a'] } }));
});
