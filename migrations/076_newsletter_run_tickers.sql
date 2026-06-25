-- Dispatch ticker tagging: extract the cashtags ($XXX) each dispatch mentions
-- and store them on the run so dispatches are searchable/filterable by ticker
-- (e.g. "every public dispatch that covered $NVDA"). GIN-indexed for @> queries.
ALTER TABLE newsletter_runs ADD COLUMN IF NOT EXISTS tickers text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS newsletter_runs_tickers_gin ON newsletter_runs USING GIN (tickers);

-- Backfill existing runs from their content. Postgres ARE has no lookahead, so
-- anchor the cashtag on a trailing word boundary (\y) to reject 7+ char runs.
UPDATE newsletter_runs nr
SET tickers = sub.arr
FROM (
  SELECT r.id, array_agg(DISTINCT m[1]) AS arr
  FROM newsletter_runs r,
       LATERAL regexp_matches(r.content, '\$([A-Z]{1,6})\y', 'g') AS m
  GROUP BY r.id
) sub
WHERE nr.id = sub.id AND nr.content IS NOT NULL;
