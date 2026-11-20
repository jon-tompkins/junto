-- Daily-loss limit now pauses NEW entries for a window instead of flattening.
alter table trading_mandates add column if not exists entries_paused_until timestamptz;
