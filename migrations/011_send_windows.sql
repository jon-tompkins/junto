-- Replace schedule_cadence with send_windows on subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS send_windows TEXT[] DEFAULT '{"morning"}';
-- Keep schedule_cadence for now for backwards compat, but stop using it

-- Also add send_windows to newsletters_v2 as the default for new subscribers
ALTER TABLE newsletters_v2 ADD COLUMN IF NOT EXISTS default_send_windows TEXT[] DEFAULT '{"morning"}';
