import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countTweetsPostedSince } from './tweet-count';

interface CapturedQuery {
  table?: string;
  columns?: string;
  options?: { count?: string; head?: boolean };
  gte?: { column: string; value: string };
}

function fakeClient(
  result: { count: number | null; error: { message: string } | null },
  captured: CapturedQuery,
): SupabaseClient {
  const client = {
    from(table: string) {
      captured.table = table;
      return {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          captured.columns = columns;
          captured.options = options;
          return {
            gte(column: string, value: string) {
              captured.gte = { column, value };
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  };
  return client as unknown as SupabaseClient;
}

test('countTweetsPostedSince uses a head/exact count and returns totals above 1000', async () => {
  const captured: CapturedQuery = {};
  const since = '2026-11-12T20:07:00.000Z';
  const result = await countTweetsPostedSince(
    fakeClient({ count: 4321, error: null }, captured),
    since,
  );
  assert.equal(result.error, null);
  assert.equal(result.count, 4321);
  assert.equal(captured.table, 'content_twitter');
  assert.equal(captured.columns, 'id');
  assert.deepEqual(captured.options, { count: 'exact', head: true });
  assert.deepEqual(captured.gte, { column: 'posted_at', value: since });
});

test('countTweetsPostedSince reports the query error and a zero count', async () => {
  const captured: CapturedQuery = {};
  const result = await countTweetsPostedSince(
    fakeClient({ count: null, error: { message: 'connection refused' } }, captured),
    '2026-11-13T00:00:00.000Z',
  );
  assert.equal(result.count, 0);
  assert.equal(result.error, 'connection refused');
  assert.equal(captured.options?.head, true);
});
