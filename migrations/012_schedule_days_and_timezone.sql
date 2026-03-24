-- Migration 012: Add day-of-week scheduling and user timezone

-- Owner controls which days the newsletter generates
ALTER TABLE newsletters_v2 ADD COLUMN IF NOT EXISTS send_days TEXT[] DEFAULT '{mon,tue,wed,thu,fri}';

-- Subscriber picks which of the owner's windows+days they want
-- Rename send_windows → receive_windows on subscriptions (subscriber's choice)
-- Add receive_days for day filtering
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS receive_days TEXT[] DEFAULT '{mon,tue,wed,thu,fri,sat,sun}';

-- Rename send_windows to receive_windows (subscriber controls)
-- Keep send_windows column for backward compat, add receive_windows
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS receive_windows TEXT[] DEFAULT '{morning}';

-- Copy existing send_windows data to receive_windows
UPDATE subscriptions SET receive_windows = send_windows WHERE send_windows IS NOT NULL AND receive_windows = '{morning}';

-- User timezone preference (default ET)
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';
