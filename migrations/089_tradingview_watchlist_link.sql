-- Link a user's public TradingView watchlist for daily sync into their myjunto watchlist.
alter table users add column if not exists tradingview_watchlist_url text;
alter table users add column if not exists tradingview_synced_at timestamptz;
