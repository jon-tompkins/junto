-- 047 — add featured_watchlist_id to users for "Primary Watchlist" surfacing
alter table users add column if not exists featured_watchlist_id uuid references watchlists(id) on delete set null;
create index if not exists idx_users_featured_watchlist_id on users(featured_watchlist_id);
