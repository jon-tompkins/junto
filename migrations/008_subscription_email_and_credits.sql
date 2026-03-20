-- Migration 008: Add delivery_email to subscriptions + credit balance improvements

-- Add delivery_email to subscriptions (per-subscription override, defaults to user.email)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS delivery_email TEXT;

-- Add schedule_cadence to subscriptions (subscriber picks their own cadence)  
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS schedule_cadence TEXT DEFAULT 'daily' CHECK (schedule_cadence IN ('daily', 'twice_daily', 'weekly'));

-- Index for credit balance lookups
CREATE INDEX IF NOT EXISTS idx_users_credit_balance ON users(credit_balance) WHERE credit_balance > 0;

-- Index for credit transactions by user
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);
