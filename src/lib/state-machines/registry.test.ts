import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES, isLegalTransition, isTerminal } from './registry';

test('every machine is internally consistent', () => {
  for (const [name, m] of Object.entries(MACHINES)) {
    const t = m.transitions as Record<string, string[]>;
    const states = Object.keys(t);
    assert.ok(states.includes(m.initial), `${name}: initial "${m.initial}" not a state`);
    for (const [from, nxt] of Object.entries(t)) for (const to of nxt) assert.ok(states.includes(to), `${name}: ${from} -> unknown "${to}"`);
  }
});

test('trade lifecycle', () => {
  assert.ok(isLegalTransition('trade', 'pending', 'submitted'));
  assert.ok(isLegalTransition('trade', 'submitted', 'open'));
  assert.ok(isLegalTransition('trade', 'open', 'closed'));
  assert.ok(!isLegalTransition('trade', 'closed', 'open'));
  assert.ok(isTerminal('trade', 'rejected'));
});
