-- Total exchange fees (entry + resizes + exit) paid on a trade, for net-of-fee scorecards.
alter table trades add column if not exists fees_usd numeric;
