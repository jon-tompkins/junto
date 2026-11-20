import test from 'node:test';
import assert from 'node:assert/strict';
import { averageOutperformance, rankByScore, type RankableCaller } from './rank';

function row(partial: Partial<RankableCaller> & Pick<RankableCaller, 'wilson_score' | 'scored'>): RankableCaller {
  return {
    total_positions: 10,
    avg_alpha_pct: null,
    ...partial,
  };
}

test('rankByScore puts the higher Wilson score first and sinks unrated callers', () => {
  const ranked = rankByScore([
    row({ wilson_score: 0, scored: 0, total_positions: 40 }),
    row({ wilson_score: 0.4, scored: 30, total_positions: 20 }),
    row({ wilson_score: 0.7, scored: 12, total_positions: 8 }),
    row({ wilson_score: 0.4, scored: 10, total_positions: 50 }),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.wilson_score),
    [0.7, 0.4, 0.4, 0],
  );
  assert.equal(ranked[1].scored, 30);
  assert.equal(ranked[3].scored, 0);
});

test('averageOutperformance ignores callers with no benchmark print', () => {
  assert.equal(averageOutperformance([]), null);
  assert.equal(averageOutperformance([{ avg_alpha_pct: null }, { avg_alpha_pct: null }]), null);
  assert.equal(averageOutperformance([{ avg_alpha_pct: 10 }, { avg_alpha_pct: null }, { avg_alpha_pct: 4 }]), 7);
});
