-- Track one-time affirmative acknowledgment that myjunto is not financial advice.
ALTER TABLE users ADD COLUMN IF NOT EXISTS disclaimer_accepted_at TIMESTAMPTZ;
