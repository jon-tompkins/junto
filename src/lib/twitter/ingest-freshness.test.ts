import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countRecentTwitterIngests, twitterIngestStaleHours } from './ingest-freshness';

test('twitterIngestStaleHours defaults to 3 and ignores non-positive values', () => {
  assert.equal(twitterIngestStaleHours(undefined), 3);
  assert.equal(twitterIngestStaleHours(''), 3);
  assert.equal(twitterIngestStaleHours('0'), 3);
  assert.equal(twitterIngestStaleHours('nope'), 3);
  assert.equal(twitterIngestStaleHours('6'), 6);
  assert.equal(twitterIngestStaleHours('1.5'), 1.5);
});

test('countRecentTwitterIngests is a head count of non-YouTube rows since the cutoff', async () => {
  const captured: {
    options?: { count?: string; head?: boolean };
    gte?: { column: string; value: string };
    not?: { column: string; operator: string; value: string };
  } = {};
  const client = {
    from(table: string) {
      assert.equal(table, 'content_twitter');
      return {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          assert.equal(columns, 'id');
          captured.options = options;
          return {
            gte(column: string, value: string) {
              captured.gte = { column, value };
              return {
                not(col: string, operator: string, pattern: string) {
                  captured.not = { column: col, operator, value: pattern };
                  return Promise.resolve({ count: 0, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  const since = '2026-11-12T17:07:00.000Z';
  const result = await countRecentTwitterIngests(client as unknown as SupabaseClient, since);
  assert.deepEqual(result, { count: 0, error: null });
  assert.deepEqual(captured.options, { count: 'exact', head: true });
  assert.deepEqual(captured.gte, { column: 'posted_at', value: since });
  assert.deepEqual(captured.not, { column: 'twitter_id', operator: 'like', value: 'yt-%' });
});
