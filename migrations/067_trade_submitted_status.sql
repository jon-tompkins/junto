-- Migration 067: Add 'submitted' trade status
-- Trades move: pending → submitted → open → closed
-- 'submitted' = order sent to broker, awaiting fill confirmation

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE trades ADD CONSTRAINT trades_status_check
  CHECK (status IN ('pending', 'submitted', 'open', 'closed', 'cancelled', 'rejected'));
