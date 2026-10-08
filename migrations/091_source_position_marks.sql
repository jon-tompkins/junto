-- 091_source_position_marks.sql
-- Mark-to-market for OPEN analyst positions so smart-money scoring can count them
-- (at reduced weight vs closed calls). Written daily by /api/cron/mark-positions.
--   mark_price / mark_return_pct  latest close vs entry_price, direction-adjusted
--   benchmark_return_pct / mark_alpha_pct  vs SPY (equity) / BTC (crypto) since entry
--   pre_move_pct / pre_move_z / is_reaction  same reaction flag as source_call_outcomes (090)
-- Idempotent, no BEGIN/COMMIT (exec_sql runner can't run those).
alter table source_positions add column if not exists mark_price numeric;
alter table source_positions add column if not exists mark_return_pct numeric;
alter table source_positions add column if not exists benchmark_return_pct numeric;
alter table source_positions add column if not exists mark_alpha_pct numeric;
alter table source_positions add column if not exists pre_move_pct numeric;
alter table source_positions add column if not exists pre_move_z numeric;
alter table source_positions add column if not exists is_reaction boolean;
alter table source_positions add column if not exists marked_at timestamptz;
