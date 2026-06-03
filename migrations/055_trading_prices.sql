-- Capture proposal-time and execution-time prices on trades.
-- proposal_price: last trade price at the moment we created the pending trade
-- execution_price: filled_avg_price returned by Alpaca after the order fills
alter table trades add column if not exists proposal_price numeric;
alter table trades add column if not exists execution_price numeric;
