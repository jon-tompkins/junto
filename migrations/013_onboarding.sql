-- Migration 013: Add onboarding flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT false;

-- Mark existing users with email as onboarded (they've already set up)
UPDATE users SET is_onboarded = true WHERE email IS NOT NULL;
