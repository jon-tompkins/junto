-- 044: Backfill per-dispatch watchlists from legacy user_watchlist
--
-- For each user that has rows in user_watchlist and owns a personal dispatch
-- (newsletters_v2.is_personal = true) without a watchlist_id, create a fresh
-- watchlists row, copy tickers into watchlist_tickers, and link it via
-- newsletters_v2.watchlist_id. user_watchlist rows are left in place for now;
-- generator code will read from the per-dispatch watchlist with a fallback
-- to user_watchlist during the transition.

BEGIN;

WITH personal_dispatches AS (
  SELECT n.id AS newsletter_id, n.admin_user_id AS user_id
  FROM newsletters_v2 n
  WHERE n.is_personal = TRUE
    AND n.watchlist_id IS NULL
    AND EXISTS (SELECT 1 FROM user_watchlist uw WHERE uw.user_id = n.admin_user_id)
),
created_watchlists AS (
  INSERT INTO watchlists (user_id, name, description)
  SELECT user_id, 'My Watchlist', 'Auto-migrated from user_watchlist'
  FROM personal_dispatches
  RETURNING id, user_id
),
linked AS (
  UPDATE newsletters_v2 n
  SET watchlist_id = cw.id
  FROM created_watchlists cw
  WHERE n.admin_user_id = cw.user_id
    AND n.is_personal = TRUE
    AND n.watchlist_id IS NULL
  RETURNING n.watchlist_id, n.admin_user_id AS user_id
)
INSERT INTO watchlist_tickers (watchlist_id, ticker)
SELECT l.watchlist_id, uw.ticker
FROM linked l
JOIN user_watchlist uw ON uw.user_id = l.user_id
ON CONFLICT (watchlist_id, ticker) DO NOTHING;

COMMIT;
