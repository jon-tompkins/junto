-- 090_call_outcome_reaction_alpha.sql
-- Per-call context for the reaction flag + smart-money scoring (Oct 2026).
--   pre_move_pct          direction-adjusted % move over the 5 sessions up to the
--                         entry close (how far it had already run in the call's favor)
--   pre_move_z            pre_move_pct / (trailing 60-session daily vol * sqrt(5))
--   is_reaction           pre_move_z >= 2 AND pre_move_pct >= 5 — the call chased a move
--   benchmark_return_pct  direction-adjusted SPY (equity) / BTC (crypto) return over the
--                         same entry→exit window
--   alpha_pct             return_pct - benchmark_return_pct
-- Idempotent, no BEGIN/COMMIT (exec_sql runner can't run those).
alter table source_call_outcomes add column if not exists pre_move_pct numeric;
alter table source_call_outcomes add column if not exists pre_move_z numeric;
alter table source_call_outcomes add column if not exists is_reaction boolean;
alter table source_call_outcomes add column if not exists benchmark_return_pct numeric;
alter table source_call_outcomes add column if not exists alpha_pct numeric;
