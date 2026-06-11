-- Credit buckets: split the single credit_balance into three provenance buckets.
--
--   credit_subscription — topped up (reset) each month by tier; use-it-or-lose-it
--   credit_purchased    — bought with cash / promos / bonuses; persists; NOT redeemable
--   credit_earned       — creator revenue-share payouts; persists; the ONLY bucket
--                         eligible for future cash/token redemption
--
-- Spend priority (cheapest-to-the-user-first, preserve the redeemable pot longest):
--   subscription -> purchased -> earned
--
-- credit_balance is kept as the authoritative TOTAL via a trigger so every existing
-- read (`select credit_balance`) keeps working unchanged.

-- 1. Bucket columns -----------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_subscription INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_purchased    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_earned       INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill: existing balances are of unknown provenance, so park them in the
--    NON-redeemable purchased bucket (conservative — never auto-create a cash
--    liability from legacy balances).
UPDATE users
SET    credit_purchased = COALESCE(credit_balance, 0)
WHERE  credit_subscription = 0
  AND  credit_purchased = 0
  AND  credit_earned = 0
  AND  COALESCE(credit_balance, 0) > 0;

-- 3. Keep credit_balance = sum(buckets) automatically on every write.
CREATE OR REPLACE FUNCTION sync_credit_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.credit_balance :=
      COALESCE(NEW.credit_subscription, 0)
    + COALESCE(NEW.credit_purchased, 0)
    + COALESCE(NEW.credit_earned, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_credit_balance ON users;
CREATE TRIGGER trg_sync_credit_balance
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_credit_balance();

-- 4. Bucket-aware deduction: spend subscription, then purchased, then earned.
--    Returns the new total balance, or -1 if insufficient / user missing.
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub  INTEGER;
  v_pur  INTEGER;
  v_earn INTEGER;
  v_rem  INTEGER := p_amount;
  v_take INTEGER;
BEGIN
  SELECT credit_subscription, credit_purchased, credit_earned
    INTO v_sub, v_pur, v_earn
  FROM   users
  WHERE  id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  IF (v_sub + v_pur + v_earn) < p_amount THEN
    RETURN -1;
  END IF;

  v_take := LEAST(v_sub, v_rem);  v_sub  := v_sub  - v_take; v_rem := v_rem - v_take;
  v_take := LEAST(v_pur, v_rem);  v_pur  := v_pur  - v_take; v_rem := v_rem - v_take;
  v_take := LEAST(v_earn, v_rem); v_earn := v_earn - v_take; v_rem := v_rem - v_take;

  UPDATE users
  SET    credit_subscription = v_sub,
         credit_purchased    = v_pur,
         credit_earned       = v_earn
  WHERE  id = p_user_id;

  RETURN v_sub + v_pur + v_earn;
END;
$$;

-- 5. Bucket-aware addition. p_bucket: 'subscription' | 'purchased' | 'earned'.
--    Defaults to 'purchased' so any legacy 2-arg caller stays non-redeemable.
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount  INTEGER,
  p_bucket  TEXT DEFAULT 'purchased'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  IF p_bucket = 'subscription' THEN
    UPDATE users SET credit_subscription = credit_subscription + p_amount WHERE id = p_user_id;
  ELSIF p_bucket = 'earned' THEN
    UPDATE users SET credit_earned = credit_earned + p_amount WHERE id = p_user_id;
  ELSE
    UPDATE users SET credit_purchased = credit_purchased + p_amount WHERE id = p_user_id;
  END IF;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  SELECT credit_balance INTO v_total FROM users WHERE id = p_user_id;
  RETURN v_total;
END;
$$;

-- 6. Monthly subscription top-up = RESET (not accumulate). Use-it-or-lose-it.
--    Call on each renewal / tier grant to set the subscription bucket to the
--    tier's monthly allotment. Returns the new total balance.
CREATE OR REPLACE FUNCTION set_subscription_credits(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  UPDATE users SET credit_subscription = p_amount WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  SELECT credit_balance INTO v_total FROM users WHERE id = p_user_id;
  RETURN v_total;
END;
$$;
